import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import peopleRoute from './routes/people.js';
import postsRoute from './routes/posts.js';
import scheduleRoute from './routes/schedule.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const initDb = async () =>
  open({
    filename: './duty.db',
    driver: sqlite3.Database,
  });

const startServer = async () => {
  try {
    const db = await initDb();
    app.locals.db = db;

    app.use('/api/people', peopleRoute);
    app.use('/api/posts', postsRoute);
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
