const router = require('express').Router();
const crypto = require('crypto');

const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');

function validSignature(raw, timestamp, signature) {
  const secret = String(
    process.env.CASHFREE_CLIENT_SECRET || ''
  ).trim();

  const ts = String(timestamp || '').trim();
  const sig = String(signature || '').trim();

  console.log('--- CASHFREE WEBHOOK DEBUG ---');
  console.log('secret present:', !!secret);
  console.log('secret length:', secret.length);
  console.log('timestamp present:', !!ts);
  console.log('signature present:', !!sig);
  console.log('signature length:', sig.length);
  console.log(
    'raw body length:',
    Buffer.byteLength(raw || '', 'utf8')
  );

  if (!secret || !raw || !ts || !sig) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(ts + raw)
    .digest('base64');

  console.log(
    'expected signature length:',
    expected.length
  );

  console.log(
    'signature match:',
    expected === sig
  );

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(sig, 'utf8')
    );
  } catch (error) {
    console.log(
      'signature compare error:',
      error.message
    );

    return false;
  }
}

router.post('/cashfree', async (req, res) => {
  try {
    const raw = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body || {});

    const timestamp = req.get(
      'x-webhook-timestamp'
    );

    const signature = req.get(
      'x-webhook-signature'
    );

    /*
      Agar Cashfree endpoint test me signature headers
      bilkul nahi aaye, to endpoint ko 200 response do.

      Signed webhook request ko hamesha verify kiya jayega.
    */
    if (!timestamp && !signature) {
      console.log(
        'Cashfree webhook endpoint test received without signature'
      );

      return res.status(200).json({
        ok: true,
        message: 'Cashfree webhook endpoint active'
      });
    }

    if (
      !validSignature(
        raw,
        timestamp,
        signature
      )
    ) {
      console.warn(
        'Invalid Cashfree webhook signature'
      );

      return res.status(401).json({
        message: 'Invalid webhook signature'
      });
    }

    let event;

    try {
      event = JSON.parse(raw);
    } catch (error) {
      console.error(
        'Cashfree invalid webhook JSON:',
        error.message
      );

      return res.status(400).json({
        message: 'Invalid webhook payload'
      });
    }

    const orderId =
      event?.data?.order?.order_id;

    const payment =
      event?.data?.payment;

    console.log(
      'Cashfree webhook verified:',
      {
        orderId: orderId || null,
        paymentStatus:
          payment?.payment_status || null
      }
    );

    if (!orderId) {
      return res.status(200).json({
        ok: true
      });
    }

    const localId =
      String(orderId).startsWith('SV_')
        ? String(orderId).slice(3)
        : String(orderId);

    const orderConditions = [
      {
        cashfreeOrderId: orderId
      }
    ];

    if (/^[a-f0-9]{24}$/i.test(localId)) {
      orderConditions.push({
        _id: localId
      });
    }

    const order = await Order.findOne({
      $or: orderConditions
    });

    if (!order) {
      console.warn(
        'Cashfree order not found:',
        orderId
      );

      return res.status(200).json({
        ok: true
      });
    }

    /*
      Payment record ko idempotent tarike se save karo.
      Ek hi Cashfree payment multiple webhook retries
      me duplicate create nahi hoga.
    */
    if (payment?.cf_payment_id) {
      await Payment.updateOne(
        {
          providerPaymentId:
            String(payment.cf_payment_id)
        },
        {
          $setOnInsert: {
            order: order._id,
            provider: 'CASHFREE',
            providerOrderId: orderId,
            providerPaymentId:
              String(payment.cf_payment_id),
            amount:
              payment.payment_amount,
            status:
              payment.payment_status,
            raw: event,
            idempotencyKey:
              'CF-' +
              payment.cf_payment_id
          }
        },
        {
          upsert: true
        }
      );
    }

    if (
      payment?.payment_status === 'SUCCESS'
    ) {
      /*
        Inventory sirf ek baar commit hoga.
      */
      if (!order.inventoryCommitted) {
        const changed = [];
        let inventoryOk = true;

        for (const item of order.items) {
          const result =
            await Product.updateOne(
              {
                _id: item.product,
                stock: {
                  $gte: item.qty
                }
              },
              {
                $inc: {
                  stock: -item.qty
                }
              }
            );

          if (!result.modifiedCount) {
            inventoryOk = false;
            break;
          }

          changed.push(item);
        }

        /*
          Agar kisi product ka stock insufficient hua,
          pehle decrease kiye products ka stock rollback.
        */
        if (!inventoryOk) {
          for (const item of changed) {
            await Product.updateOne(
              {
                _id: item.product
              },
              {
                $inc: {
                  stock: item.qty
                }
              }
            );
          }

          console.error(
            'Cashfree paid order stock conflict',
            order.orderNumber
          );

          return res.status(200).json({
            ok: true,
            warning: 'paid-stock-conflict'
          });
        }

        order.inventoryCommitted = true;

        /*
          Successful payment ke baad customer cart clear
          aur loyalty points add.
        */
        await User.updateOne(
          {
            _id: order.user
          },
          {
            $set: {
              cart: []
            },
            $inc: {
              loyaltyPoints:
                Math.floor(order.total / 100)
            }
          }
        );

        /*
          Coupon usage ek baar increment.
        */
        if (order.couponCode) {
          await Coupon.updateOne(
            {
              code: order.couponCode
            },
            {
              $inc: {
                usedCount: 1
              }
            }
          );
        }
      }

      const firstPaid =
        order.paymentStatus !== 'PAID';

      order.paymentStatus = 'PAID';

      if (
        order.status ===
        'Payment Pending'
      ) {
        order.status = 'Confirmed';

        order.timeline.push({
          status: 'Confirmed',
          at: new Date()
        });
      }

      await order.save();

      /*
        Notification sirf pehli successful payment par.
      */
      if (firstPaid) {
        await Notification.create({
          user: order.user,
          type: 'PAYMENT',
          title: 'Payment successful',
          message:
            `Payment received for ${order.orderNumber}`,
          link: '/orders.html'
        });
      }

      console.log(
        'Cashfree payment processed successfully:',
        order.orderNumber
      );
    }

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error(
      'Cashfree webhook:',
      error
    );

    return res.status(400).json({
      message:
        'Webhook processing failed'
    });
  }
});

module.exports = router;