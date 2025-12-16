import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createDb } from './db.js';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

const createTables = async db => {
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS people (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT NOT NULL,
      sameGenderPref BOOLEAN NOT NULL DEFAULT false,
      limitedAbility BOOLEAN NOT NULL DEFAULT false,
      standingExemption BOOLEAN NOT NULL DEFAULT false,
      duelGuard BOOLEAN NOT NULL DEFAULT false,
      userId INTEGER REFERENCES users(id)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      requiredPerShift INTEGER NOT NULL DEFAULT 1,
      optional BOOLEAN NOT NULL DEFAULT false,
      userId INTEGER REFERENCES users(id)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS assignments (
      id SERIAL PRIMARY KEY,
      personId INTEGER NOT NULL,
      postId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftLabel TEXT NOT NULL,
      startISO TEXT,
      endISO TEXT,
      userId INTEGER REFERENCES users(id)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS bw_assignments (
      id SERIAL PRIMARY KEY,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      slotId TEXT NOT NULL,
      userId INTEGER REFERENCES users(id)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS es_assignments (
      id SERIAL PRIMARY KEY,
      groupId TEXT NOT NULL,
      personId INTEGER NOT NULL,
      userId INTEGER REFERENCES users(id)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS constraints (
      id SERIAL PRIMARY KEY,
      personId INTEGER NOT NULL,
      title TEXT NOT NULL,
      startISO TEXT NOT NULL,
      endISO TEXT NOT NULL,
      userId INTEGER REFERENCES users(id)
    );
  `);

  // Archived tables for history lookback
  await db.run(`DROP TABLE IF EXISTS archived_assignments`);
  await db.run(`
    CREATE TABLE archived_assignments (
      archive_date DATE NOT NULL,
      personId INTEGER NOT NULL,
      postId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftLabel TEXT NOT NULL,
      startISO TEXT,
      endISO TEXT,
      userId INTEGER,
      PRIMARY KEY (archive_date, personId, postId, day, shiftLabel)
    );
  `);

  await db.run(`DROP TABLE IF EXISTS archived_bw_assignments`);
  await db.run(`
    CREATE TABLE archived_bw_assignments (
      archive_date DATE NOT NULL,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      slotId TEXT NOT NULL,
      userId INTEGER,
      PRIMARY KEY (archive_date, personId, day, slotId)
    );
  `);

  await db.run(`DROP TABLE IF EXISTS archived_es_assignments`);
  await db.run(`
    CREATE TABLE archived_es_assignments (
      archive_date DATE NOT NULL,
      groupId TEXT NOT NULL,
      personId INTEGER NOT NULL,
      userId INTEGER,
      PRIMARY KEY (archive_date, groupId, personId)
    );
  `);
};

const ensureBooleanColumns = async db => {
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS limitedAbility BOOLEAN NOT NULL DEFAULT false;');
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS standingExemption BOOLEAN NOT NULL DEFAULT false;');
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS duelGuard BOOLEAN NOT NULL DEFAULT false;');
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS sameGenderPref BOOLEAN NOT NULL DEFAULT false;');
  await db.run('ALTER TABLE posts ADD COLUMN IF NOT EXISTS optional BOOLEAN NOT NULL DEFAULT false;');
};

const ensureUserIdColumn = async (db, table) => {
  await db.run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS userId INTEGER;`);
};

const seedAdmin = async db => {
  const existing = await db.get('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
  if (existing) return existing.id;
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const result = await db.run(
    'INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2, $3) RETURNING id',
    [ADMIN_EMAIL, hash, new Date().toISOString()]
  );
  console.log(`Seeded admin user ${ADMIN_EMAIL}`);
  return result.lastID;
};

const attachRowsToAdmin = async (db, adminId) => {
  const tables = ['people', 'posts', 'assignments', 'bw_assignments', 'es_assignments', 'constraints'];
  for (const table of tables) {
    await db.run(`UPDATE ${table} SET userId = $1 WHERE userId IS NULL`, [adminId]);
  }
};

const runMigration = async () => {
  const db = await createDb();

  try {
    await createTables(db);
    await ensureBooleanColumns(db);
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
