// Sprint 10: apply 006_user_actions idempotently to production DB
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '006_user_actions.sql'), 'utf-8');

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  multipleStatements: true,
});

console.log(`Connected to ${process.env.DB_HOST}/${process.env.DB_NAME}`);

const [rows] = await conn.query("SHOW TABLES LIKE 'user_actions'");
if (rows.length > 0) {
  console.log('user_actions table already exists — skipping create');
} else {
  console.log('Applying migration 006_user_actions...');
  await conn.query(sql);
  console.log('Done.');
}

await conn.query(
  `CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(50) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`
);
await conn.query(
  `INSERT INTO schema_migrations (version) VALUES ('006_user_actions') ON DUPLICATE KEY UPDATE version = version`
);
console.log('Tracked as 006_user_actions in schema_migrations.');

const [check] = await conn.query('DESCRIBE user_actions');
console.log('user_actions columns:', check.map(c => c.Field).join(', '));

await conn.end();
console.log('OK.');
