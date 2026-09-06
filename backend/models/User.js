const mongoose=require('mongoose');
const addressSchema=new mongoose.Schema({name:String,mobile:String,line1:String,line2:String,city:String,state:String,pincode:String,type:{type:String,default:'Home'},isDefault:{type:Boolean,default:false}},{_id:true});
const schema=new mongoose.Schema({name:{type:String,required:true,trim:true},email:{type:String,required:true,unique:true,lowercase:true,trim:true},mobile:String,password:{type:String,required:true},role:{type:String,enum:['customer','admin'],default:'customer'},wishlist:[{type:mongoose.Schema.Types.ObjectId,ref:'Product'}],cart:[{product:{type:mongoose.Schema.Types.ObjectId,ref:'Product'},qty:{type:Number,default:1},variant:String}],addresses:[addressSchema],loyaltyPoints:{type:Number,default:0},walletBalance:{type:Number,default:0},resetOtpHash:String,resetOtpExpires:Date,resetOtpAttempts:{type:Number,default:0},resetOtpLastSentAt:Date,status:{type:String,enum:['ACTIVE','SUSPENDED'],default:'ACTIVE'},adminRole:{type:String,enum:['SUPER_ADMIN','PRODUCT_MANAGER','ORDER_MANAGER','FINANCE_ADMIN','SUPPORT_MANAGER','MARKETING_MANAGER','CUSTOMER_MANAGER'],default:'SUPER_ADMIN'},recentlyViewed:[{product:{type:mongoose.Schema.Types.ObjectId,ref:'Product'},at:{type:Date,default:Date.now}}],searchHistory:[{query:String,at:{type:Date,default:Date.now}}]},{timestamps:true});

// Backward compatibility: older ShopVerse builds stored normal customers as "user".
// Normalize the legacy value before Mongoose enum validation so cart/wishlist saves never fail.
schema.pre('validate',function(next){
  if(this.role==='user') this.role='customer';
  next();
});

module.exports=mongoose.model('User',schema);
