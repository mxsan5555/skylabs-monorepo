const path=require('node:path');require('dotenv').config({path:path.resolve('apps/mera-driver-api/.env.local'),quiet:true});process.env.PORT='3336';require('./production-build/main.js');
