import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';

(async () => {
  const db = await open({
    filename: './duty.db',
    driver: sqlite3.Database
  });
  const sql = fs.readFileSync('./migrations/init.sql', 'utf8');
  await db.exec(sql);
  console.log('Migration applied.');
  await db.close();
})();
