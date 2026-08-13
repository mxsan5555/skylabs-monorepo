import { env } from './config/env';
import app from './app';

const server = app.listen(env.port, () => {
  console.log(`msd-api listening at http://localhost:${env.port}/api/v1 (docs at /docs)`);
});
server.on('error', console.error);
