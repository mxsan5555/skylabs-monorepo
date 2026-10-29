// Read-only public-origin network check: no API parameters, authentication or SMS.
require('dotenv').config({path:'apps/mera-driver-api/.env.local',quiet:true});
const https=require('node:https'),http=require('node:http');
try{
 const configured=new URL(process.env.SMS_API_URL);const origin=new URL(configured.origin);origin.username='';origin.password='';origin.pathname='/';origin.search='';origin.hash='';
 const transport=origin.protocol==='https:'?https:http;
 const request=transport.request(origin,{method:'HEAD',timeout:5000},response=>{console.log(JSON.stringify({check:'sms_public_origin_connectivity',networkReachable:true,httpStatus:response.statusCode,providerCredentialsTested:false,smsSent:false}));response.resume();});
 request.on('timeout',()=>request.destroy(Object.assign(new Error('Timeout'),{code:'ETIMEDOUT'})));
 request.on('error',error=>{console.log(JSON.stringify({check:'sms_public_origin_connectivity',networkReachable:false,code:['EACCES','EPERM','ETIMEDOUT','ENOTFOUND','ECONNREFUSED','ECONNRESET'].includes(error.code)?error.code:'CONNECTION_FAILED',providerCredentialsTested:false,smsSent:false}));process.exitCode=1;});request.end();
}catch{console.log(JSON.stringify({check:'sms_public_origin_connectivity',configurationValid:false,smsSent:false}));process.exitCode=1;}
