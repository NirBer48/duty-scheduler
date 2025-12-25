import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import peopleRoute from './routes/people.js';
import postsRoute from './routes/posts.js';
import scheduleRoute from './routes/schedule.js';
import constraintsRoute from './routes/constraints.js';
import authRoute from './routes/auth.js';
import cookieParser from 'cookie-parser';
import { requireAuth, attachUserIfPresent } from './middleware/auth.js';
import { createDb } from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use(attachUserIfPresent);

const initDb = async () => {
  const db = await createDb();
  // simple connectivity check
  await db.query('SELECT 1');
  return db;
};

const startServer = async () => {
  try {
    const db = await initDb();
    app.locals.db = db;

    app.use('/api/auth', authRoute);
    app.use('/api/people', requireAuth, peopleRoute);
    app.use('/api/posts', requireAuth, postsRoute);
    app.use('/api/constraints', requireAuth, constraintsRoute);
    app.use('/api/schedule', requireAuth, scheduleRoute);
    app.get('/api/health', (_req, res) => res.json({ ok: true }));

    app.use((err, _req, res, _next) => {
      console.error(err);
      res.status(500).json({ error: 'internal error' });
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
};

startServer();
