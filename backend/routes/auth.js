const router=require('express').Router();
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const crypto=require('crypto');
const User=require('../models/User');
const mailer=require('../services/mailer');
const {auth}=require('../middleware/auth');
const sign=u=>jwt.sign({id:u._id,role:u.role,email:u.email},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'7d'});
const safe=u=>({id:u._id,name:u.name,email:u.email,mobile:u.mobile||'',role:u.role,avatar:u.avatar||'',status:u.status||'ACTIVE'});
const normalizeIdentifier=v=>String(v||'').trim().toLowerCase();
const findByIdentifier=v=>{const x=normalizeIdentifier(v);return User.findOne({email:x})};
router.post('/register',async(req,res)=>{try{let{name,email,mobile,password,confirmPassword}=req.body||{};name=String(name||'').trim();email=String(email||'').trim().toLowerCase();mobile=String(mobile||'').replace(/\D/g,'');password=String(password||'');confirmPassword=String(confirmPassword||'');if(name.length<2)return res.status(400).json({message:'Name must be at least 2 characters'});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({message:'Valid email required'});if(mobile&&!/^[6-9]\d{9}$/.test(mobile))return res.status(400).json({message:'Valid 10 digit Indian mobile required'});if(password.length<6)return res.status(400).json({message:'Password must be at least 6 characters'});if(confirmPassword&&password!==confirmPassword)return res.status(400).json({message:'Passwords do not match'});if(await User.exists({email}))return res.status(409).json({message:'Email already registered'});if(mobile&&await User.exists({mobile}))return res.status(409).json({message:'Mobile number already registered'});const data={name,email,password:await bcrypt.hash(password,12),role:'customer'};if(mobile)data.mobile=mobile;const user=await User.create(data);res.status(201).json({success:true,message:'Registration successful',token:sign(user),user:safe(user)})}catch(e){console.error('REGISTER ERROR:',e);if(e.code===11000){const f=Object.keys(e.keyPattern||e.keyValue||{})[0]||'Field';return res.status(409).json({message:`${f} already registered`})}res.status(e.name==='ValidationError'?400:500).json({message:e.message||'Registration failed'})}});
router.post('/login',async(req,res)=>{try{const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');const user=await User.findOne({email});if(!user||!await bcrypt.compare(password,user.password))return res.status(401).json({message:'Invalid email or password'});if(user.role==='user'){user.role='customer';await user.save()}if(user.status==='SUSPENDED')return res.status(403).json({message:'Account suspended'});res.json({success:true,message:'Login successful',token:sign(user),user:safe(user)})}catch(e){res.status(500).json({message:e.message||'Login failed'})}});

// Email-only password reset. OTP is sent only to the registered email address.
router.post('/forgot-password',async(req,res)=>{try{
  const identifier=normalizeIdentifier(req.body.identifier||req.body.email);
  if(!identifier)return res.status(400).json({message:'Enter your registered email'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier))return res.status(400).json({message:'Enter a valid registered email'});
  const user=await findByIdentifier(identifier);
  // Generic response prevents account enumeration.
  if(!user)return res.json({message:'If the account exists, the OTP has been sent to the registered email.'});
  if(user.resetOtpLastSentAt && Date.now()-new Date(user.resetOtpLastSentAt).getTime()<60_000)return res.status(429).json({message:'Please wait 60 seconds before requesting another OTP'});
  if(!mailer.configured())return res.status(503).json({message:'Email OTP service is not configured on server'});
  const otp=String(crypto.randomInt(100000,1000000));
  await mailer.sendPasswordOtp({to:user.email,name:user.name,otp});
  user.resetOtpHash=await bcrypt.hash(otp,10);user.resetOtpExpires=new Date(Date.now()+10*60*1000);user.resetOtpAttempts=0;user.resetOtpLastSentAt=new Date();await user.save();
  res.json({message:'OTP sent to your registered email.',maskedEmail:user.email.replace(/^(.{2}).*(@.*)$/,'$1***$2')});
}catch(e){console.error('FORGOT PASSWORD ERROR:',e);res.status(500).json({message:e.message||'Unable to send OTP'})}});

router.post('/reset-password',async(req,res)=>{try{
  const identifier=normalizeIdentifier(req.body.identifier||req.body.email);const otp=String(req.body.otp||'');const password=String(req.body.password||'');
  if(!identifier||!otp)return res.status(400).json({message:'Email and OTP required'});if(password.length<6)return res.status(400).json({message:'Password must be 6+ characters'});
  const user=await findByIdentifier(identifier);if(!user||!user.resetOtpHash||!user.resetOtpExpires||user.resetOtpExpires<=new Date())return res.status(400).json({message:'Invalid or expired OTP'});
  if((user.resetOtpAttempts||0)>=5)return res.status(429).json({message:'Too many invalid attempts. Request a new OTP'});
  if(!await bcrypt.compare(otp,user.resetOtpHash)){user.resetOtpAttempts=(user.resetOtpAttempts||0)+1;await user.save();return res.status(400).json({message:'Invalid or expired OTP'});}
  user.password=await bcrypt.hash(password,12);user.resetOtpHash=undefined;user.resetOtpExpires=undefined;user.resetOtpAttempts=0;user.resetOtpLastSentAt=undefined;await user.save();res.json({message:'Password reset successful'});
}catch(e){res.status(500).json({message:e.message})}});
router.post('/change-password',auth,async(req,res)=>{try{const user=await User.findById(req.user._id);if(!await bcrypt.compare(req.body.currentPassword||'',user.password))return res.status(400).json({message:'Current password is incorrect'});if(!req.body.newPassword||req.body.newPassword.length<6)return res.status(400).json({message:'New password must be 6+ characters'});user.password=await bcrypt.hash(req.body.newPassword,12);await user.save();res.json({message:'Password changed'})}catch(e){res.status(500).json({message:e.message})}});
router.get('/me',auth,(req,res)=>res.json({user:req.user}));
module.exports=router;
