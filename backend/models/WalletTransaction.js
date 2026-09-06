const mongoose=require('mongoose');
const schema=new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},type:{type:String,enum:['CREDIT','DEBIT'],required:true},amount:{type:Number,required:true,min:0},reason:{type:String,required:true},reference:String,balanceAfter:Number},{timestamps:true});
module.exports=mongoose.model('WalletTransaction',schema);