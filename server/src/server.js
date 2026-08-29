import app from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { runMigrations } from './config/migrate.js';

let server;

async function start() {
  await runMigrations();
  server = app.listen(env.PORT, env.HOST, () => console.log(`API listening on http://${env.HOST}:${env.PORT}`));
}

async function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
start().catch(error => { console.error('Startup failed:', error); process.exit(1); });
