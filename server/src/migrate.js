import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_PATH = process.env.DATABASE_PATH || './data/duty.db';
const DB_DIR = path.dirname(DB_PATH);
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

// Ensure DB directory exists before running migrations
fs.mkdirSync(DB_DIR, { recursive: true });

const ensureLimitedAbilityColumn = async db => {
  const columns = await db.all('PRAGMA table_info(people)');
  const hasColumn = columns.some(column => column.name === 'limitedAbility');
  if (!hasColumn) {
    await db.run('ALTER TABLE people ADD COLUMN limitedAbility INTEGER NOT NULL DEFAULT 0');
    console.log('Added limitedAbility column to people table.');
  }
};

const ensureStandingExemptionColumn = async db => {
  const columns = await db.all('PRAGMA table_info(people)');
  const hasColumn = columns.some(column => column.name === 'standingExemption');
  if (!hasColumn) {
    await db.run('ALTER TABLE people ADD COLUMN standingExemption INTEGER NOT NULL DEFAULT 0');
    console.log('Added standingExemption column to people table.');
  }
};

const ensureDuelGuardColumn = async db => {
  const columns = await db.all('PRAGMA table_info(people)');
  const hasColumn = columns.some(column => column.name === 'duelGuard');
  if (!hasColumn) {
    await db.run('ALTER TABLE people ADD COLUMN duelGuard INTEGER NOT NULL DEFAULT 0');
    console.log('Added duelGuard column to people table.');
  }
};

const ensureBWAssignmentsTable = async db => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bw_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      slotId TEXT NOT NULL
    )
  `);
};

const ensureESAssignmentsTable = async db => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS es_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      groupId TEXT NOT NULL,
      personId INTEGER NOT NULL
    )
  `);
};

const ensureConstraintsTable = async db => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS constraints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      personId INTEGER NOT NULL,
      title TEXT NOT NULL,
      startISO TEXT NOT NULL,
      endISO TEXT NOT NULL
    )
  `);
};

const ensureUsersTable = async db => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
};

const ensureUserIdColumn = async (db, table) => {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  const has = cols.some(c => c.name === 'userId');
  if (!has) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN userId INTEGER`);
    console.log(`Added userId to ${table}`);
  }
};

const seedAdmin = async db => {
  const existing = await db.get('SELECT * FROM users WHERE email = ?', ADMIN_EMAIL);
  if (existing) return existing.id;
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const result = await db.run(
    'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)',
    [ADMIN_EMAIL, hash, new Date().toISOString()]
  );
  console.log(`Seeded admin user ${ADMIN_EMAIL}`);
  return result.lastID;
};

const attachRowsToAdmin = async (db, adminId) => {
  const tables = ['people', 'posts', 'assignments', 'bw_assignments', 'es_assignments', 'constraints'];
  for (const table of tables) {
    await db.run(`UPDATE ${table} SET userId = ? WHERE userId IS NULL`, adminId);
  }
};

const runMigration = async () => {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  try {
    const sql = fs.readFileSync('./migrations/init.sql', 'utf8');
    await db.exec(sql);
    await ensureLimitedAbilityColumn(db);
    await ensureStandingExemptionColumn(db);
    await ensureDuelGuardColumn(db);
    await ensureBWAssignmentsTable(db);
    await ensureESAssignmentsTable(db);
    await ensureConstraintsTable(db);
    await ensureUsersTable(db);
    await ensureUserIdColumn(db, 'people');
    await ensureUserIdColumn(db, 'posts');
    await ensureUserIdColumn(db, 'assignments');
    await ensureUserIdColumn(db, 'bw_assignments');
    await ensureUserIdColumn(db, 'es_assignments');
    await ensureUserIdColumn(db, 'constraints');
    const adminId = await seedAdmin(db);
    await attachRowsToAdmin(db, adminId);
    console.log('Migration applied.');
  } catch (err) {
    console.error('Migration failed', err);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
};

runMigration();
