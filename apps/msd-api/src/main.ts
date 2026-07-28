import { env } from './env';
import { createApp } from './app';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`msd-api listening at http://localhost:${env.port}/api`);
  console.log(`Swagger docs at http://localhost:${env.port}/docs`);
});
server.on('error', console.error);
