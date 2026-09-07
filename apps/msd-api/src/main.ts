import { env } from './config/env';
import app from './app';

// Last-resort safety net for anything outside the request lifecycle (per-request errors are
// already handled by middleware/errorHandler.ts). A rejection is recoverable — log and keep
// serving. An uncaught exception leaves process state unknown — log and exit so a process
// manager (pm2/systemd/k8s) can restart cleanly, rather than keep serving from a corrupted state.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

const server = app.listen(env.port, () => {
  console.log(`msd-api listening at http://localhost:${env.port}/api/v1 (docs at /docs)`);
});
server.on('error', console.error);
