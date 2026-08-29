import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../migrations');

export async function runMigrations() {
  const conn = await mysql.createConnection({ host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, multipleStatements: true });
  try {
    await conn.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
    const files = await fs.readdir(migrationsDir);
    const names = files.filter(x => x.endsWith('.sql')).sort();
    for (const name of names) {
      const [rows] = await conn.execute('SELECT id FROM schema_migrations WHERE name = ? LIMIT 1', [name]);
      if (rows.length) continue;
      const sql = await fs.readFile(path.join(migrationsDir, name), 'utf8');
      await conn.query(sql);
      await conn.execute('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
      console.log(`Applied migration: ${name}`);
    }
  } finally { await conn.end(); }
}
