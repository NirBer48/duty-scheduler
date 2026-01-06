BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

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
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  requiredPerShift INTEGER NOT NULL DEFAULT 1,
  optional BOOLEAN NOT NULL DEFAULT false,
  userId INTEGER REFERENCES users(id)
);

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

CREATE TABLE IF NOT EXISTS bw_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  slotId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS es_assignments (
  id SERIAL PRIMARY KEY,
  groupId TEXT NOT NULL,
  personId INTEGER NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS constraints (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  title TEXT NOT NULL,
  startISO TEXT NOT NULL,
  endISO TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS kitchen_settings (
  id SERIAL PRIMARY KEY,
  requiredPerShift INTEGER NOT NULL DEFAULT 36,
  requiredShift1 INTEGER NOT NULL DEFAULT 36,
  requiredShift2 INTEGER NOT NULL DEFAULT 36,
  shift2Start TEXT NOT NULL DEFAULT '13:00',
  userId INTEGER REFERENCES users(id)
);

-- Dynamic kitchen shifts (replaces hardcoded 2-shift kitchen_settings columns).
-- Shifts must form a contiguous 06:00–21:00 partition per user.
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

CREATE TABLE IF NOT EXISTS kitchen_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS escort_settings (
  id SERIAL PRIMARY KEY,
  requiredPerShift INTEGER NOT NULL DEFAULT 4,
  requiredShift1 INTEGER NOT NULL DEFAULT 4,
  requiredShift2 INTEGER NOT NULL DEFAULT 4,
  requiredShift3 INTEGER NOT NULL DEFAULT 4,
  requiredShift4 INTEGER NOT NULL DEFAULT 4,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS escort_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS rasar_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS escort400_assignments (
  id SERIAL PRIMARY KEY,
  personId INTEGER NOT NULL,
  day TEXT NOT NULL,
  shiftId TEXT NOT NULL,
  userId INTEGER REFERENCES users(id)
);

COMMIT;
