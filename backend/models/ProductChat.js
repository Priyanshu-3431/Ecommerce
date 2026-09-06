const mongoose=require('mongoose');
const messageSchema=new mongoose.Schema({sender:{type:mongoose.Schema.Types.ObjectId,ref:'User'},senderRole:{type:String,enum:['customer','admin'],required:true},text:{type:String,required:true,trim:true,maxlength:2000},at:{type:Date,default:Date.now}},{_id:true});
const schema=new mongoose.Schema({product:{type:mongoose.Schema.Types.ObjectId,ref:'Product',required:true,index:true},user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},messages:[messageSchema],status:{type:String,enum:['OPEN','RESOLVED'],default:'OPEN'},unreadForAdmin:{type:Boolean,default:true},unreadForCustomer:{type:Boolean,default:false},lastMessageAt:{type:Date,default:Date.now,index:true}},{timestamps:true});
schema.index({product:1,user:1},{unique:true});
module.exports=mongoose.model('ProductChat',schema);
