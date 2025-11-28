import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import peopleRoute from './routes/people.js';
import postsRoute from './routes/posts.js';
import scheduleRoute from './routes/schedule.js';

const app = express();
app.use(cors());
app.use(express.json());

(async () => {
  // Open the SQLite database, create if not exists
  const db = await open({
    filename: './duty.db',
    driver: sqlite3.Database
  });
  app.locals.db = db;

  app.use('/api/people', peopleRoute);
  app.use('/api/posts', postsRoute);
  app.use('/api/schedule', scheduleRoute);
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
})();
