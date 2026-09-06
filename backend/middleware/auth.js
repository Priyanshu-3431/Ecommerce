const jwt=require('jsonwebtoken'); const User=require('../models/User');
async function auth(req,res,next){try{const h=req.headers.authorization||'';const token=h.startsWith('Bearer ')?h.slice(7):null;if(!token)return res.status(401).json({message:'Login required'});const d=jwt.verify(token,process.env.JWT_SECRET);req.user=await User.findById(d.id).select('-password');if(!req.user)return res.status(401).json({message:'User not found'});if(req.user.status==='SUSPENDED')return res.status(403).json({message:'Account suspended'});next();}catch(e){res.status(401).json({message:'Invalid or expired token'});}}
const role=(...roles)=>(req,res,next)=>roles.includes(req.user?.role)?next():res.status(403).json({message:'Forbidden'});
module.exports={auth,role};
