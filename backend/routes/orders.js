const router = require('express').Router();
const crypto = require('crypto');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const cashfree = require('../services/cashfree');
const Coupon = require('../models/Coupon');

router.use(auth);

function num(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function cleanAddress(address = {}) {
  return {
    name: String(address.name || '').trim(),
    mobile: String(address.mobile || '').trim(),
    line1: String(address.line1 || '').trim(),
    line2: String(address.line2 || '').trim(),
    city: String(address.city || '').trim(),
    state: String(address.state || '').trim(),
    pincode: String(address.pincode || '').trim(),
  };
}

function validateAddress(address) {
  if (!address.name || !address.mobile || !address.line1 || !address.city || !address.pincode) {
    return 'Please enter full name, mobile, address, city and PIN code';
  }
  if (!/^\d{10}$/.test(address.mobile)) return 'Enter a valid 10-digit mobile number';
  if (!/^\d{6}$/.test(address.pincode)) return 'Enter a valid 6-digit PIN code';
  return null;
}

router.post('/quote', async (req, res) => {
  try {
    const u = await User.findById(req.user._id).populate('cart.product');
    if (!u) return res.status(401).json({ message: 'User not found' });
    if (!u.cart.length) return res.status(400).json({ message: 'Cart empty' });

    let subtotal = 0;
    for (const x of u.cart) {
      if (!x.product || x.product.stock < x.qty) {
        return res.status(409).json({ message: 'Stock changed. Please review cart.' });
      }
      subtotal += x.product.price * x.qty;
    }

    const shipping = subtotal >= 999 ? 0 : 79;
    const tax = num(subtotal * 0.05);
    let discount = 0;
    let coupon = null;
    const couponCode=String(req.body.couponCode||'').trim().toUpperCase();
    if(couponCode){
      coupon=await Coupon.findOne({code:couponCode,active:true});
      const now=new Date();
      if(!coupon || (coupon.startAt&&coupon.startAt>now) || (coupon.expiresAt&&coupon.expiresAt<now) || subtotal<coupon.minOrder){
        return res.status(400).json({message:'Coupon is invalid, expired, or minimum order not met'});
      }
      discount=coupon.type==='PERCENT'?subtotal*coupon.value/100:coupon.value;
      if(coupon.maxDiscount)discount=Math.min(discount,coupon.maxDiscount);
      discount=num(discount);
    }
    return res.json({subtotal:num(subtotal),shipping,tax,discount,coupon:coupon?.code||null,total:num(subtotal+shipping+tax-discount)});
  } catch (e) {
    console.error('Quote error:', e);
    return res.status(500).json({ message: 'Unable to calculate order total' });
  }
});

router.post('/', async (req, res) => {
  let createdOrder = null;
  try {
    const paymentMethod = String(req.body.paymentMethod || 'COD').toUpperCase();
    if (!['COD', 'CASHFREE'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    const address = cleanAddress(req.body.address);
    const addressError = validateAddress(address);
    if (addressError) return res.status(400).json({ message: addressError });

    if (paymentMethod === 'CASHFREE' && !cashfree.configured()) {
      return res.status(400).json({
        message: 'Cashfree is not configured. Add CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET in backend/.env, then restart the server.',
      });
    }

    const u = await User.findById(req.user._id).populate('cart.product');
    if (!u) return res.status(401).json({ message: 'User not found' });
    if (!u.cart.length) return res.status(400).json({ message: 'Cart empty' });

    let subtotal = 0;
    const items = [];
    for (const x of u.cart) {
      if (!x.product || x.product.stock < x.qty) {
        return res.status(409).json({ message: `Insufficient stock: ${x.product?.name || 'product'}` });
      }
      const qty = Math.max(1, Number(x.qty) || 1);
      subtotal += x.product.price * qty;
      items.push({ product: x.product._id, name: x.product.name, qty, price: x.product.price, seller: x.product.sellerId || undefined });
    }

    const shipping = subtotal >= 999 ? 0 : 79;
    const tax = num(subtotal * 0.05);
    let discount=0; let appliedCoupon=null;
    const couponCode=String(req.body.couponCode||'').trim().toUpperCase();
    if(couponCode){
      appliedCoupon=await Coupon.findOne({code:couponCode,active:true});
      const now=new Date();
      if(!appliedCoupon || (appliedCoupon.startAt&&appliedCoupon.startAt>now) || (appliedCoupon.expiresAt&&appliedCoupon.expiresAt<now) || subtotal<appliedCoupon.minOrder)return res.status(400).json({message:'Coupon is invalid, expired, or minimum order not met'});
      discount=appliedCoupon.type==='PERCENT'?subtotal*appliedCoupon.value/100:appliedCoupon.value;
      if(appliedCoupon.maxDiscount)discount=Math.min(discount,appliedCoupon.maxDiscount);
      discount=num(discount);
    }
    const total = num(subtotal + shipping + tax - discount);
    const orderNumber = 'SV' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();

    createdOrder = await Order.create({
      orderNumber,
      user: u._id,
      items,
      address,
      subtotal: num(subtotal),
      shipping,
      tax,
      discount,
      couponCode: appliedCoupon?.code || '',
      total,
      paymentMethod,
      paymentStatus: paymentMethod === 'COD' ? 'COD' : 'PENDING',
      status: paymentMethod === 'COD' ? 'Confirmed' : 'Payment Pending',
      timeline: [
        { status: 'Order Placed', at: new Date() },
        ...(paymentMethod === 'COD' ? [{ status: 'Confirmed', at: new Date() }] : []),
      ],
    });

    if (paymentMethod === 'COD') {
      // Reserve/deduct stock only if every item is still available.
      for (const x of items) {
        const r = await Product.updateOne(
          { _id: x.product, stock: { $gte: x.qty } },
          { $inc: { stock: -x.qty } }
        );
        if (!r.modifiedCount) {
          createdOrder.status = 'Cancelled';
          createdOrder.timeline.push({ status: 'Cancelled', at: new Date() });
          await createdOrder.save();
          return res.status(409).json({ message: `Stock changed while placing order: ${x.name}` });
        }
      }

      createdOrder.inventoryCommitted = true;
      await createdOrder.save();
      // Clear cart with updateOne so legacy document validation can never block checkout.
      await User.updateOne({ _id: u._id }, { $set: { cart: [], role: u.role === 'user' ? 'customer' : u.role } });
      const Notification=require('../models/Notification');await Notification.create({user:u._id,type:'ORDER',title:'Order confirmed',message:`${createdOrder.orderNumber} has been confirmed`,link:'/orders.html'});await User.updateOne({_id:u._id},{$inc:{loyaltyPoints:Math.floor(createdOrder.total/100)}});if(appliedCoupon)await Coupon.updateOne({_id:appliedCoupon._id},{$inc:{usedCount:1}});return res.status(201).json({ order: createdOrder, paymentRequired: false });
    }

    let cf;
    try {
      const cfOrderId = `SV_${String(createdOrder._id)}`;
      cf = await cashfree.createOrder({
        order_id: cfOrderId,
        order_amount: createdOrder.total,
        order_currency: 'INR',
        customer_details: {
          customer_id: String(u._id),
          customer_name: u.name || address.name,
          customer_email: u.email,
          customer_phone: u.mobile || address.mobile,
        },
        order_meta: {
          return_url: `${process.env.FRONTEND_URL || 'http://localhost:5000'}/orders.html?verify=${createdOrder._id}`,
          notify_url: `${process.env.BACKEND_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:5000'}/api/webhooks/cashfree`,
        },
        order_note: `ShopVerse ${createdOrder.orderNumber}`,
        order_tags: { shopverse_order: createdOrder.orderNumber, mongo_order_id: String(createdOrder._id) },
      }, `cashfree-order-${createdOrder._id}`);
    } catch (cfErr) {
      // Do not leave a phantom pending order when Cashfree could not create its order.
      await Order.deleteOne({ _id: createdOrder._id, paymentStatus: 'PENDING' });
      createdOrder = null;
      const cfMessage = cfErr.response?.data?.message || cfErr.response?.data?.type || cfErr.message || 'Cashfree request failed';
      console.error('Cashfree create order error:', cfErr.response?.data || cfErr.message);
      return res.status(502).json({ message: `Cashfree error: ${cfMessage}` });
    }

    createdOrder.cashfreeOrderId = cf.order_id;
    await createdOrder.save();
    return res.status(201).json({
      order: createdOrder,
      paymentRequired: true,
      paymentSessionId: cf.payment_session_id,
      cashfreeMode: cashfree.mode(),
    });
  } catch (e) {
    console.error('Create order error:', e);
    return res.status(500).json({ message: e.message || 'Unable to create order' });
  }
});

router.get('/verify/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.paymentMethod === 'COD') return res.json({ order });
    if (!cashfree.configured()) return res.status(400).json({ message: 'Cashfree is not configured' });

    const cf = await cashfree.fetchOrder(order.cashfreeOrderId || `SV_${order._id}`);
    if (cf.order_status === 'PAID') {
      if (!order.inventoryCommitted) {
        const changed=[];
        for (const x of order.items) {
          const r = await Product.updateOne({_id:x.product,stock:{$gte:x.qty}},{$inc:{stock:-x.qty}});
          if (!r.modifiedCount) {
            for(const y of changed) await Product.updateOne({_id:y.product},{$inc:{stock:y.qty}});
            return res.status(409).json({ message: 'Payment received but stock changed. Contact support; do not retry payment.' });
          }
          changed.push(x);
        }
        order.inventoryCommitted=true;
        await User.updateOne({_id:req.user._id},{$set:{cart:[],role:req.user.role==='user'?'customer':req.user.role},$inc:{loyaltyPoints:Math.floor(order.total/100)}});
        if(order.couponCode) await Coupon.updateOne({code:order.couponCode},{$inc:{usedCount:1}});
      }
      if(order.paymentStatus!=='PAID') order.paymentStatus='PAID';
      if(order.status==='Payment Pending'){order.status='Confirmed';order.timeline.push({status:'Confirmed',at:new Date()})}
      await order.save();
    }
    return res.json({ order, cashfreeStatus: cf.order_status });
  } catch (e) {
    console.error('Verify payment error:', e.response?.data || e);
    return res.status(500).json({ message: e.response?.data?.message || e.message });
  }
});

router.get('/', async (req, res) => {
  return res.json(await Order.find({ user: req.user._id }).sort({ createdAt: -1 }));
});

router.get('/:id', async (req, res) => {
  const o = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!o) return res.status(404).json({ message: 'Not found' });
  return res.json(o);
});

module.exports = router;
