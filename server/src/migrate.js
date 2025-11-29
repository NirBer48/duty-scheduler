import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';

const runMigration = async () => {
  const db = await open({
    filename: './duty.db',
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
