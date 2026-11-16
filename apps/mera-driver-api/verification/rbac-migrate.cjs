const path=require('node:path');require('dotenv').config({path:path.resolve('apps/mera-driver-api/.env.local'),quiet:true});
const {spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate',...(process.argv.length > 2 ? process.argv.slice(2) : ['status']),'--schema','apps/mera-driver-api/prisma/schema.prisma'],{stdio:'inherit',env:process.env});process.exitCode=result.status??1;
