import { app } from './app';

const port = process.env.PORT ? Number(process.env.PORT) : 3334;
const server = app.listen(port, () => {
  console.log(`mera-driver-api listening at http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
});
server.on('error', console.error);
