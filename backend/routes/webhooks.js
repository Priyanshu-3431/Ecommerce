const router = require('express').Router();
const crypto = require('crypto');

const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');

function validSignature(raw, timestamp, signature) {
  if (
    !process.env.CASHFREE_CLIENT_SECRET ||
    !raw ||
    !timestamp ||
    !signature
  ) {
    return false;
  }

  const expected = crypto
    .createHmac(
      'sha256',
      process.env.CASHFREE_CLIENT_SECRET
    )
    .update(String(timestamp) + raw)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
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
      Cashfree Dashboard endpoint test may not always
      contain a real signed payment payload.

      If both signature headers are missing,
      acknowledge the endpoint test with HTTP 200.

      Real Cashfree webhook requests containing
      signature headers are always verified below.
    */
    if (!timestamp && !signature) {
      console.log(
        'Cashfree webhook endpoint test received'
      );

      return res.status(200).json({
        ok: true,
        message: 'Cashfree webhook endpoint active'
      });
    }

    // Real webhook must have a valid signature
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
    } catch {
      return res.status(400).json({
        message: 'Invalid webhook payload'
      });
    }

    const orderId =
      event?.data?.order?.order_id;

    const payment =
      event?.data?.payment;

    // Nothing useful to process
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

    // Avoid forcing Cashfree retries
    if (!order) {
      console.warn(
        'Cashfree order not found:',
        orderId
      );

      return res.status(200).json({
        ok: true
      });
    }

    // Save payment record
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

    // Successful payment
    if (
      payment?.payment_status === 'SUCCESS'
    ) {
      // Commit inventory once
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

        // Roll back stock if one product fails
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