// Start the current app-owned production build on the development UI's API port.
require('dotenv').config({path:'apps/mera-driver-api/.env.local',quiet:true});
process.env.PORT='3334';
require('./production-build/main.js');
