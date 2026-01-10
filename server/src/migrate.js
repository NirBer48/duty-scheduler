import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createDb } from './db.js';
import { v4 as uuidv4 } from 'uuid';

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
      asthmaExemption BOOLEAN NOT NULL DEFAULT false,
      kitchenExemption BOOLEAN NOT NULL DEFAULT false,
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

  await db.run(`
    CREATE TABLE IF NOT EXISTS custom_hours (
      id SERIAL PRIMARY KEY,
      personId INTEGER NOT NULL,
      date TEXT NOT NULL,
      reason TEXT NOT NULL,
      hours NUMERIC NOT NULL,
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

  // Dynamic kitchen shift definitions (replaces hardcoded 2-shift kitchen_settings columns).
  await db.run(`
    CREATE TABLE IF NOT EXISTS kitchen_shifts (
      id SERIAL PRIMARY KEY,
      shiftId TEXT NOT NULL,
      idx INTEGER NOT NULL,
      startHHmm TEXT NOT NULL,
      endHHmm TEXT NOT NULL,
      required INTEGER NOT NULL DEFAULT 36,
      userId INTEGER REFERENCES users(id),
      UNIQUE(userId, shiftId),
      UNIQUE(userId, idx)
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
  await db.run(`
    CREATE TABLE IF NOT EXISTS archived_assignments (
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

  await db.run(`
    CREATE TABLE IF NOT EXISTS archived_bw_assignments (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      slotId TEXT NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, personId, day, slotId)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS archived_es_assignments (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      groupId TEXT NOT NULL,
      personId INTEGER NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, groupId, personId)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS archived_kitchen_settings (
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

  await db.run(`
    CREATE TABLE IF NOT EXISTS archived_kitchen_shifts (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      shiftId TEXT NOT NULL,
      idx INTEGER NOT NULL,
      startHHmm TEXT NOT NULL,
      endHHmm TEXT NOT NULL,
      required INTEGER NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, userId, shiftId)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS archived_kitchen_assignments (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftId TEXT NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, personId, day, shiftId)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS archived_escort_settings (
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

  await db.run(`
    CREATE TABLE IF NOT EXISTS archived_escort_assignments (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftId TEXT NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, personId, day, shiftId)
    );
  `);

  // NEW: archived rasar + escort400 so justice/history can include them across restarts
  await db.run(`
    CREATE TABLE IF NOT EXISTS archived_rasar_assignments (
      schedule_start DATE NOT NULL,
      schedule_end DATE NOT NULL,
      personId INTEGER NOT NULL,
      day TEXT NOT NULL,
      shiftId TEXT NOT NULL,
      userId INTEGER,
      PRIMARY KEY (schedule_start, schedule_end, personId, day, shiftId)
    );
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS archived_escort400_assignments (
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
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS asthmaExemption BOOLEAN NOT NULL DEFAULT false;');
  await db.run('ALTER TABLE people ADD COLUMN IF NOT EXISTS kitchenExemption BOOLEAN NOT NULL DEFAULT false;');
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

const ensureKitchenShiftsColumns = async db => {
  // In case the table exists from an older version with missing columns.
  await db.run('ALTER TABLE kitchen_shifts ADD COLUMN IF NOT EXISTS shiftId TEXT;');
  await db.run('ALTER TABLE kitchen_shifts ADD COLUMN IF NOT EXISTS idx INTEGER;');
  await db.run('ALTER TABLE kitchen_shifts ADD COLUMN IF NOT EXISTS startHHmm TEXT;');
  await db.run('ALTER TABLE kitchen_shifts ADD COLUMN IF NOT EXISTS endHHmm TEXT;');
  await db.run('ALTER TABLE kitchen_shifts ADD COLUMN IF NOT EXISTS required INTEGER NOT NULL DEFAULT 36;');

  // Avoid noisy Postgres errors: only run legacy-healing statements if the legacy columns exist.
  const columnRows = await db.all(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kitchen_shifts'"
  );
  const cols = new Set((columnRows || []).map(r => (r.column_name || '').toString()));

  // Heal older schemas that used shiftIndex/shiftindex (often NOT NULL) instead of idx.
  // We keep the legacy column if present, but ensure it won't block inserts going forward.
  if (cols.has('shiftindex')) {
    await db.run('UPDATE kitchen_shifts SET idx = COALESCE(idx, shiftindex) WHERE idx IS NULL');
    await db.run('ALTER TABLE kitchen_shifts ALTER COLUMN shiftindex DROP NOT NULL');
  }
  // Quoted camelCase legacy column (rare) would appear as shiftIndex in information_schema
  if (cols.has('shiftIndex')) {
    await db.run('UPDATE kitchen_shifts SET idx = COALESCE(idx, "shiftIndex") WHERE idx IS NULL');
    await db.run('ALTER TABLE kitchen_shifts ALTER COLUMN "shiftIndex" DROP NOT NULL');
  }

  // Heal older schemas that stored hour/min columns and enforced NOT NULL.
  // (Some schemas used lowercase, others used camelCase without quoting -> becomes lowercase in Postgres)
  if (cols.has('starthour')) await db.run('ALTER TABLE kitchen_shifts ALTER COLUMN starthour DROP NOT NULL');
  if (cols.has('startminute')) await db.run('ALTER TABLE kitchen_shifts ALTER COLUMN startminute DROP NOT NULL');
  if (cols.has('endhour')) await db.run('ALTER TABLE kitchen_shifts ALTER COLUMN endhour DROP NOT NULL');
  if (cols.has('endminute')) await db.run('ALTER TABLE kitchen_shifts ALTER COLUMN endminute DROP NOT NULL');

  // Some older versions used camelCase but without quoting (=> starthour/startminute/etc), so these are mostly redundant,
  // but we keep them gated so they never generate errors.
  if (cols.has('startHour')) await db.run('ALTER TABLE kitchen_shifts ALTER COLUMN startHour DROP NOT NULL');
  if (cols.has('startMinute')) await db.run('ALTER TABLE kitchen_shifts ALTER COLUMN startMinute DROP NOT NULL');
  if (cols.has('endHour')) await db.run('ALTER TABLE kitchen_shifts ALTER COLUMN endHour DROP NOT NULL');
  if (cols.has('endMinute')) await db.run('ALTER TABLE kitchen_shifts ALTER COLUMN endMinute DROP NOT NULL');
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
    'kitchen_shifts',
    'kitchen_assignments',
    'escort_settings',
    'escort_assignments',
  ];
  for (const table of tables) {
    await db.run(`UPDATE ${table} SET userId = $1 WHERE userId IS NULL`, [adminId]);
  }
};

const clampHHmm = (value, fallback = '13:00') => {
  const str = (value || fallback || '').toString();
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  let h = Number(m[1]);
  let mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return fallback;
  h = Math.min(23, Math.max(0, h));
  mm = Math.min(59, Math.max(0, mm));
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const hhmmToMinutes = (hhmm) => {
  const m = (hhmm || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
};

const minutesToHHmm = (mins) => {
  const m = Math.min(24 * 60 - 1, Math.max(0, Number(mins) || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const migrateKitchenSettingsToKitchenShifts = async (db) => {
  // For each user, if kitchen_shifts is empty, seed from legacy kitchen_settings
  const users = await db.all('SELECT id FROM users');
  for (const u of users) {
    const userId = Number(u.id);
    const existing = await db.all('SELECT shiftId FROM kitchen_shifts WHERE userId = $1 LIMIT 1', [userId]);
    if (existing && existing.length) continue;

    const ks = await db.get('SELECT * FROM kitchen_settings WHERE userId = $1 LIMIT 1', [userId]);
    const requiredPerShift = Number(ks?.requiredpershift ?? ks?.requiredPerShift ?? 36);
    const req1 = Number(ks?.requiredshift1 ?? ks?.requiredShift1 ?? requiredPerShift ?? 36);
    const req2 = Number(ks?.requiredshift2 ?? ks?.requiredShift2 ?? requiredPerShift ?? 36);

    const rawShift2 = clampHHmm(ks?.shift2start ?? ks?.shift2Start ?? '13:00', '13:00');
    // clamp into 06:00..20:59 to avoid empty second shift
    const min = 6 * 60;
    const max = 20 * 60 + 59;
    const s2 = Math.min(max, Math.max(min, hhmmToMinutes(rawShift2)));
    const shift2Start = minutesToHHmm(s2);

    // If split is invalid (shouldn't happen), fall back to single shift.
    const makeTwo = (shift2Start !== '06:00' && shift2Start !== '21:00');

    if (makeTwo) {
      const id1 = uuidv4();
      const id2 = uuidv4();
      await db.run(
        'INSERT INTO kitchen_shifts (shiftId, idx, startHHmm, endHHmm, required, userId) VALUES ($1, $2, $3, $4, $5, $6)',
        [id1, 0, '06:00', shift2Start, Math.max(0, req1), userId]
      );
      await db.run(
        'INSERT INTO kitchen_shifts (shiftId, idx, startHHmm, endHHmm, required, userId) VALUES ($1, $2, $3, $4, $5, $6)',
        [id2, 1, shift2Start, '21:00', Math.max(0, req2), userId]
      );
      // Migrate current kitchen assignment shift IDs to the new opaque IDs.
      await db.run(
        "UPDATE kitchen_assignments SET shiftId = $1 WHERE userId = $2 AND shiftId = 'kitchen_1'",
        [id1, userId]
      );
      await db.run(
        "UPDATE kitchen_assignments SET shiftId = $1 WHERE userId = $2 AND shiftId = 'kitchen_2'",
        [id2, userId]
      );
    } else {
      const id = uuidv4();
      await db.run(
        'INSERT INTO kitchen_shifts (shiftId, idx, startHHmm, endHHmm, required, userId) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, 0, '06:00', '21:00', Math.max(0, requiredPerShift ?? req1 ?? req2 ?? 36), userId]
      );
      // Any legacy kitchen_1/_2 assignments become invalid under single shift; drop them.
      await db.run(
        "DELETE FROM kitchen_assignments WHERE userId = $1 AND (shiftId = 'kitchen_1' OR shiftId = 'kitchen_2')",
        [userId]
      );
    }
  }
};

const runMigration = async () => {
  const db = await createDb();

  try {
    await createTables(db);
    await ensureBooleanColumns(db);
    await ensureKitchenEscortSettingsColumns(db);
    await ensureKitchenShiftsColumns(db);
    await ensureUserIdColumn(db, 'people');
    await ensureUserIdColumn(db, 'posts');
    await ensureUserIdColumn(db, 'assignments');
    await ensureUserIdColumn(db, 'bw_assignments');
    await ensureUserIdColumn(db, 'es_assignments');
    await ensureUserIdColumn(db, 'constraints');
    await ensureUserIdColumn(db, 'kitchen_settings');
    await ensureUserIdColumn(db, 'kitchen_shifts');
    await ensureUserIdColumn(db, 'kitchen_assignments');
    await ensureUserIdColumn(db, 'escort_settings');
    await ensureUserIdColumn(db, 'escort_assignments');
    await ensureUserIdColumn(db, 'custom_hours');
    const adminId = await seedAdmin(db);
    await attachRowsToAdmin(db, adminId);
    await migrateKitchenSettingsToKitchenShifts(db);
    console.log('Migration applied.');
  } catch (err) {
    console.error('Migration failed', err);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
};

runMigration();
