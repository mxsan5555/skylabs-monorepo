import { app } from './app';
import { sweepExpiredOffers } from './services/trip-workflow.service';

const port = process.env.PORT ? Number(process.env.PORT) : 3334;
const server = app.listen(port, () => {
  console.log(`mera-driver-api listening at http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
});
server.on('error', console.error);
const offerSweep = setInterval(() => { sweepExpiredOffers().catch(() => console.error('Trip offer expiry sweep failed; dispatch remains available')); }, 30000);
offerSweep.unref();
server.on('close', () => clearInterval(offerSweep));
