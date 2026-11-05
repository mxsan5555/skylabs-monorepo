const {spawnSync}=require('node:child_process');
require('dotenv').config({path:'apps/mera-driver-api/.env.local',quiet:true});
if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error('Local development database required');
const action=process.argv[2]||'status';
if(!['status','deploy'].includes(action))throw new Error('Unsupported migration action');
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate',action,'--schema=apps/mera-driver-api/prisma/schema.prisma'],{env:process.env,encoding:'utf8'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exitCode=result.status??1;
