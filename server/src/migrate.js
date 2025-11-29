import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || './data/duty.db';
const DB_DIR = path.dirname(DB_PATH);

// Ensure DB directory exists before running migrations
fs.mkdirSync(DB_DIR, { recursive: true });

const runMigration = async () => {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  try {
    const sql = fs.readFileSync('./migrations/init.sql', 'utf8');
    await db.exec(sql);
    console.log('Migration applied.');
  } catch (err) {
    console.error('Migration failed', err);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
};

runMigration();
