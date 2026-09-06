const nodemailer = require('nodemailer');

function configured(){
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
function transporter(){
  if(!configured()) throw new Error('Email OTP is not configured. Add SMTP settings in backend/.env');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase()==='true' || Number(process.env.SMTP_PORT)===465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}
async function sendPasswordOtp({to,name,otp}){
  const from = process.env.SMTP_FROM || `ShopVerse <${process.env.SMTP_USER}>`;
  return transporter().sendMail({
    from,to,
    subject:'ShopVerse password reset OTP',
    text:`Hello ${name||'Customer'}, your ShopVerse password reset OTP is ${otp}. It expires in 10 minutes. Do not share this code.`,
    html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px"><h2>ShopVerse password reset</h2><p>Hello ${String(name||'Customer').replace(/[<>]/g,'')},</p><p>Use this OTP to reset your password:</p><div style="font-size:30px;font-weight:800;letter-spacing:8px;padding:16px;background:#f4f6fb;border-radius:12px;text-align:center">${otp}</div><p>This OTP expires in <b>10 minutes</b>. Do not share it with anyone.</p><p style="color:#667085">If you did not request a reset, you can ignore this email.</p></div>`
  });
}
module.exports={configured,sendPasswordOtp};
