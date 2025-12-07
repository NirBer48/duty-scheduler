import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import peopleRoute from './routes/people.js';
import postsRoute from './routes/posts.js';
import scheduleRoute from './routes/schedule.js';
import constraintsRoute from './routes/constraints.js';

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = process.env.DATABASE_PATH || './data/duty.db';
const DB_DIR = path.dirname(DB_PATH);

// Ensure the directory for the SQLite file exists before opening the DB
fs.mkdirSync(DB_DIR, { recursive: true });

app.use(cors());
app.use(express.json());

const initDb = async () =>
  open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

const startServer = async () => {
  try {
    const db = await initDb();
    app.locals.db = db;

    app.use('/api/people', peopleRoute);
    app.use('/api/posts', postsRoute);
    app.use('/api/constraints', constraintsRoute);
    app.use('/api/schedule', scheduleRoute);
    app.get('/api/health', (_req, res) => res.json({ ok: true }));

    app.use((err, _req, res, _next) => {
      console.error(err);
      res.status(500).json({ error: 'internal error' });
    });

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
};

startServer();
