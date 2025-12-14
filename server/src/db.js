import pkg from 'pg';

const { Pool } = pkg;

const buildSslConfig = () => {
  // Allow disabling certificate verification in hosted environments such as Azure
  if (process.env.PGSSLMODE === 'require' || process.env.PGSSLMODE === 'enable') {
    return { rejectUnauthorized: false };
  }
  return undefined;
};

export const createDb = () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://duty:duty@duty-scheduler-db.postgres.database.azure.com:5432/duty',
    ssl: buildSslConfig(),
  });

  const query = (text, params = []) => pool.query(text, params);

  const all = async (text, params = []) => {
    const res = await query(text, params);
    return res.rows;
  };

  const get = async (text, params = []) => {
    const res = await query(text, params);
    return res.rows[0] || null;
  };

  const run = async (text, params = []) => {
    const res = await query(text, params);
    // Align with sqlite run() by exposing last inserted id when available
    const lastID = res.rows?.[0]?.id ?? null;
    return { lastID, rowCount: res.rowCount };
  };

  const close = () => pool.end();

  return { query, all, get, run, close };
};

