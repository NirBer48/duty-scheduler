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
      nightGuardExemption BOOLEAN NOT NULL DEFAULT false,
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

  // Kitchen duty settings + assignments
  await db.run(`
    CREATE TABLE IF NOT EXISTS kitchen_settings (
      id SERIAL PRIMARY KEY,
      requiredPerShift INTEGER NOT NULL DEFAULT 36,
      requiredShift1 INTEGER NOT NULL DEFAULT 36,
      requiredShift2 INTEGER NOT NULL DEFAULT 36,
      shift2Start TEXT NOT NULL DEFAULT '13:00',
      userId INTEGER REFERENCES users(id)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS kitchen_assignments (
      id SERIAL PRIMARY KEY,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftId TEXT NOT NULL,
      userId INTEGER REFERENCES users(id)
    );
  `);

  // Contractor escort duty ("ליווי קבלנים") settings + assignments
  await db.run(`
    CREATE TABLE IF NOT EXISTS escort_settings (
      id SERIAL PRIMARY KEY,
      requiredPerShift INTEGER NOT NULL DEFAULT 4,
      requiredShift1 INTEGER NOT NULL DEFAULT 4,
      requiredShift2 INTEGER NOT NULL DEFAULT 4,
      requiredShift3 INTEGER NOT NULL DEFAULT 4,
      requiredShift4 INTEGER NOT NULL DEFAULT 4,
      userId INTEGER REFERENCES users(id)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS escort_assignments (
      id SERIAL PRIMARY KEY,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftId TEXT NOT NULL,
      userId INTEGER REFERENCES users(id)
    );
  `);

  // RASAR duty ("רס\"ר") assignments
  await db.run(`
    CREATE TABLE IF NOT EXISTS rasar_assignments (
      id SERIAL PRIMARY KEY,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftId TEXT NOT NULL,
      userId INTEGER REFERENCES users(id)
    );
  `);

  // Contractor escort duty - 400 ("ליווי קבלנים - 400") assignments
  await db.run(`
    CREATE TABLE IF NOT EXISTS escort400_assignments (
      id SERIAL PRIMARY KEY,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftId TEXT NOT NULL,
      userId INTEGER REFERENCES users(id)
    );
  `);

  // Archived tables for history lookback
  await db.run(`DROP TABLE IF EXISTS archived_assignments`);
  await db.run(`
    CREATE TABLE archived_assignments (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      personId INTEGER NOT NULL,
      postId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftLabel TEXT NOT NULL,
      startISO TEXT,
      endISO TEXT,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, personId, postId, day, shiftLabel)
    );
  `);

  await db.run(`DROP TABLE IF EXISTS archived_bw_assignments`);
  await db.run(`
    CREATE TABLE archived_bw_assignments (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      slotId TEXT NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, personId, day, slotId)
    );
  `);

  await db.run(`DROP TABLE IF EXISTS archived_es_assignments`);
  await db.run(`
    CREATE TABLE archived_es_assignments (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      groupId TEXT NOT NULL,
      personId INTEGER NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, groupId, personId)
    );
  `);

  await db.run(`DROP TABLE IF EXISTS archived_kitchen_settings`);
  await db.run(`
    CREATE TABLE archived_kitchen_settings (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      requiredPerShift INTEGER NOT NULL,
      requiredShift1 INTEGER NOT NULL,
      requiredShift2 INTEGER NOT NULL,
      shift2Start TEXT NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, userId)
    );
  `);

  await db.run(`DROP TABLE IF EXISTS archived_kitchen_assignments`);
  await db.run(`
    CREATE TABLE archived_kitchen_assignments (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftId TEXT NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, personId, day, shiftId)
    );
  `);

  await db.run(`DROP TABLE IF EXISTS archived_escort_settings`);
  await db.run(`
    CREATE TABLE archived_escort_settings (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      requiredPerShift INTEGER NOT NULL,
      requiredShift1 INTEGER NOT NULL,
      requiredShift2 INTEGER NOT NULL,
      requiredShift3 INTEGER NOT NULL,
      requiredShift4 INTEGER NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, userId)
    );
  `);

  await db.run(`DROP TABLE IF EXISTS archived_escort_assignments`);
  await db.run(`
    CREATE TABLE archived_escort_assignments (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftId TEXT NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, personId, day, shiftId)
    );
  `);
};

const ensureBooleanColumns = async db => {
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS limitedAbility BOOLEAN NOT NULL DEFAULT false;');
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS standingExemption BOOLEAN NOT NULL DEFAULT false;');
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS duelGuard BOOLEAN NOT NULL DEFAULT false;');
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS nightGuardExemption BOOLEAN NOT NULL DEFAULT false;');
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS sameGenderPref BOOLEAN NOT NULL DEFAULT false;');
  await db.run('ALTER TABLE posts ADD COLUMN IF NOT EXISTS optional BOOLEAN NOT NULL DEFAULT false;');
};

const ensureKitchenEscortSettingsColumns = async db => {
  await db.run('ALTER TABLE kitchen_settings ADD COLUMN IF NOT EXISTS requiredShift1 INTEGER NOT NULL DEFAULT 36;');
  await db.run('ALTER TABLE kitchen_settings ADD COLUMN IF NOT EXISTS requiredShift2 INTEGER NOT NULL DEFAULT 36;');
  await db.run('ALTER TABLE escort_settings ADD COLUMN IF NOT EXISTS requiredShift1 INTEGER NOT NULL DEFAULT 4;');
  await db.run('ALTER TABLE escort_settings ADD COLUMN IF NOT EXISTS requiredShift2 INTEGER NOT NULL DEFAULT 4;');
  await db.run('ALTER TABLE escort_settings ADD COLUMN IF NOT EXISTS requiredShift3 INTEGER NOT NULL DEFAULT 4;');
  await db.run('ALTER TABLE escort_settings ADD COLUMN IF NOT EXISTS requiredShift4 INTEGER NOT NULL DEFAULT 4;');
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
  const tables = [
    'people',
    'posts',
    'assignments',
    'bw_assignments',
    'es_assignments',
    'constraints',
    'kitchen_settings',
    'kitchen_assignments',
    'escort_settings',
    'escort_assignments',
  ];
  for (const table of tables) {
    await db.run(`UPDATE ${table} SET userId = $1 WHERE userId IS NULL`, [adminId]);
  }
};

const runMigration = async () => {
  const db = await createDb();

  try {
    await createTables(db);
    await ensureBooleanColumns(db);
    await ensureKitchenEscortSettingsColumns(db);
    await ensureUserIdColumn(db, 'people');
    await ensureUserIdColumn(db, 'posts');
    await ensureUserIdColumn(db, 'assignments');
    await ensureUserIdColumn(db, 'bw_assignments');
    await ensureUserIdColumn(db, 'es_assignments');
    await ensureUserIdColumn(db, 'constraints');
    await ensureUserIdColumn(db, 'kitchen_settings');
    await ensureUserIdColumn(db, 'kitchen_assignments');
    await ensureUserIdColumn(db, 'escort_settings');
    await ensureUserIdColumn(db, 'escort_assignments');
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
