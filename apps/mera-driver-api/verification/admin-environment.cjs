const path=require('node:path');
require('dotenv').config({path:path.resolve('apps/mera-driver-api/.env.local'),quiet:true});
const {PrismaClient}=require('../src/generated/prisma-client');
const prisma=new PrismaClient();
(async()=>{try{console.log(JSON.stringify({databaseHost:new URL(process.env.DATABASE_URL).hostname,apiPort:process.env.PORT,userCount:await prisma.user.count(),driverCount:await prisma.driver.count()}));}catch(e){console.error('Database connection blocked:',e.code,e.message.replace(process.env.DATABASE_URL,'[database URL]'));process.exitCode=1;}finally{await prisma.$disconnect();}})();
