import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { env } from '../config/env.js';
import { schema } from './schema.js';

export const pool = mysql.createPool({
  uri: env.databaseUrl,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  charset: 'utf8mb4',
});

export const db = drizzle(pool, { schema, mode: 'default' });

export async function pingDatabase() {
  await pool.query('SELECT 1 AS ok');
}
