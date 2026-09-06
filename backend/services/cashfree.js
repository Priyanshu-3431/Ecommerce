const axios=require('axios');const crypto=require('crypto');
const base=()=>String(process.env.CASHFREE_ENV||'sandbox').toLowerCase()==='production'?'https://api.cashfree.com/pg':'https://sandbox.cashfree.com/pg';
const apiVersion=()=>process.env.CASHFREE_API_VERSION||'2025-01-01';
const headers=(idempotencyKey)=>{const h={'x-client-id':process.env.CASHFREE_CLIENT_ID,'x-client-secret':process.env.CASHFREE_CLIENT_SECRET,'x-api-version':apiVersion(),'Content-Type':'application/json','x-request-id':crypto.randomUUID()};if(idempotencyKey)h['x-idempotency-key']=idempotencyKey;return h};
function configured(){return !!(process.env.CASHFREE_CLIENT_ID&&process.env.CASHFREE_CLIENT_SECRET)}
function mode(){return String(process.env.CASHFREE_ENV||'sandbox').toLowerCase()==='production'?'production':'sandbox'}
async function createOrder(payload,idempotencyKey){if(!configured())throw new Error('Cashfree keys are not configured');const {data}=await axios.post(base()+'/orders',payload,{headers:headers(idempotencyKey)});return data}
async function fetchOrder(id){if(!configured())throw new Error('Cashfree keys are not configured');const {data}=await axios.get(base()+'/orders/'+encodeURIComponent(id),{headers:headers()});return data}
async function fetchPayments(id){if(!configured())throw new Error('Cashfree keys are not configured');const {data}=await axios.get(base()+'/orders/'+encodeURIComponent(id)+'/payments',{headers:headers()});return data}
async function createRefund(orderId,payload){if(!configured())throw new Error('Cashfree keys are not configured');const {data}=await axios.post(base()+'/orders/'+encodeURIComponent(orderId)+'/refunds',payload,{headers:headers(payload.refund_id||crypto.randomUUID())});return data}
async function fetchRefund(orderId,refundId){if(!configured())throw new Error('Cashfree keys are not configured');const {data}=await axios.get(base()+'/orders/'+encodeURIComponent(orderId)+'/refunds/'+encodeURIComponent(refundId),{headers:headers()});return data}
module.exports={createOrder,fetchOrder,fetchPayments,createRefund,fetchRefund,configured,mode,apiVersion};
