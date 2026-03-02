import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';

mkdirSync('./data', { recursive: true });

const sqlite = new Database('./data/chainmind.db');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_token TEXT NOT NULL UNIQUE,
    deposit_code TEXT NOT NULL UNIQUE,
    balance_micro_usdc INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    type TEXT NOT NULL,
    model TEXT,
    provider TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_write_tokens INTEGER,
    cost_micro_usdc INTEGER NOT NULL,
    balance_after_micro_usdc INTEGER NOT NULL,
    tx_hash TEXT,
    routed INTEGER NOT NULL DEFAULT 0,
    requested_model TEXT,
    actual_model TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    tx_hash TEXT NOT NULL UNIQUE,
    from_address TEXT NOT NULL,
    amount_micro_usdc INTEGER NOT NULL,
    block_number INTEGER NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite, { schema });
export const rawDb: DatabaseType = sqlite;
