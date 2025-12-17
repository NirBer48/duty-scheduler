import pkg from 'pg';

const { Pool } = pkg;

export const createDb = async () => {
  console.log(`DB: creating pool... ${process.env.DATABASE_URL}`);

  const connectionString = process.env.DATABASE_URL;
  const isAzure = connectionString.includes('azure.com');

  const pool = new Pool({
    connectionString,
    ssl: isAzure ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log('DB: testing connection...');
    await pool.query('select 1');
    console.log('DB: connection OK');
  } catch (err) {
    console.error('DB: connection FAILED', err);
    throw err; // <-- IMPORTANT
  }

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

