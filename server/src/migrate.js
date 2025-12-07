import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || './data/duty.db';
const DB_DIR = path.dirname(DB_PATH);

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
    console.log('Migration applied.');
  } catch (err) {
    console.error('Migration failed', err);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
};

runMigration();
