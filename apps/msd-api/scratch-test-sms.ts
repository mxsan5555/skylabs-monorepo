import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '.env.local') });

import { sendOtp } from './src/providers/sms/connectExpress.provider';

async function main() {
  const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`Sending test OTP ${testOtp} to 9889259224 via ConnectExpress...`);
  const result = await sendOtp('9889259224', testOtp);
  console.log('sendOtp() returned:', result);
}

main().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});
