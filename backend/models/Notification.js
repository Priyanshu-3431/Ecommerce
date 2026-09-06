const mongoose=require('mongoose');
const schema=new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},type:{type:String,default:'GENERAL'},title:{type:String,required:true},message:{type:String,required:true},link:String,read:{type:Boolean,default:false}},{timestamps:true});
module.exports=mongoose.model('Notification',schema);