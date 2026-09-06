const router=require('express').Router();
const crypto=require('crypto');
const Order=require('../models/Order');
const Product=require('../models/Product');
const User=require('../models/User');
const Coupon=require('../models/Coupon');
const Payment=require('../models/Payment');
const Notification=require('../models/Notification');
function valid(raw,timestamp,signature){if(!process.env.CASHFREE_CLIENT_SECRET||!raw||!timestamp||!signature)return false;const expected=crypto.createHmac('sha256',process.env.CASHFREE_CLIENT_SECRET).update(String(timestamp)+raw).digest('base64');try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature))}catch{return false}}
router.post('/cashfree',async(req,res)=>{try{
  const raw=req.body.toString('utf8'),timestamp=req.get('x-webhook-timestamp'),signature=req.get('x-webhook-signature');
  if(!valid(raw,timestamp,signature))return res.status(401).json({message:'Invalid webhook signature'});
  const event=JSON.parse(raw);const orderId=event?.data?.order?.order_id;const payment=event?.data?.payment;if(!orderId)return res.json({ok:true});
  const localId=String(orderId).startsWith('SV_')?String(orderId).slice(3):String(orderId);const ors=[{cashfreeOrderId:orderId}];if(/^[a-f0-9]{24}$/i.test(localId))ors.push({_id:localId});const order=await Order.findOne({$or:ors});if(!order)return res.json({ok:true});
  if(payment?.cf_payment_id)await Payment.updateOne({providerPaymentId:String(payment.cf_payment_id)},{$setOnInsert:{order:order._id,provider:'CASHFREE',providerOrderId:orderId,providerPaymentId:String(payment.cf_payment_id),amount:payment.payment_amount,status:payment.payment_status,raw:event,idempotencyKey:'CF-'+payment.cf_payment_id}},{upsert:true});
  if(payment?.payment_status==='SUCCESS'){
    if(!order.inventoryCommitted){const changed=[];let ok=true;for(const x of order.items){const r=await Product.updateOne({_id:x.product,stock:{$gte:x.qty}},{$inc:{stock:-x.qty}});if(!r.modifiedCount){ok=false;break}changed.push(x)}if(!ok){for(const y of changed)await Product.updateOne({_id:y.product},{$inc:{stock:y.qty}});console.error('Cashfree paid order stock conflict',order.orderNumber);return res.json({ok:true,warning:'paid-stock-conflict'})}order.inventoryCommitted=true;await User.updateOne({_id:order.user},{$set:{cart:[]},$inc:{loyaltyPoints:Math.floor(order.total/100)}});if(order.couponCode)await Coupon.updateOne({code:order.couponCode},{$inc:{usedCount:1}})}
    const firstPaid=order.paymentStatus!=='PAID';order.paymentStatus='PAID';if(order.status==='Payment Pending'){order.status='Confirmed';order.timeline.push({status:'Confirmed',at:new Date()})}await order.save();if(firstPaid)await Notification.create({user:order.user,type:'PAYMENT',title:'Payment successful',message:`Payment received for ${order.orderNumber}`,link:'/orders.html'});
  }
  res.json({ok:true});
}catch(e){console.error('Cashfree webhook:',e);res.status(400).json({message:'Webhook processing failed'})}});
module.exports=router;
