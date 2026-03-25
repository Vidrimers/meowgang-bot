import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

// Создаём пул соединений с PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Экспортируем инстанс Drizzle с типизированной схемой
export const db = drizzle(pool, { schema });

export type DB = typeof db;
