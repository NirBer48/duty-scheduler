import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const router = express.Router();
const getDb = req => req.app.locals.db;
const JWT_SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'auth_token';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

const signToken = payload =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

const DEFAULT_POSTS = [
  { name: 'שג רכוב קדמי', requiredPerShift: 2 },
  { name: 'שג רכוב אחורי', requiredPerShift: 2 },
  { name: 'שג רגלי', requiredPerShift: 1 },
  { name: 'פטל', requiredPerShift: 1 },
  { name: 'ימח', requiredPerShift: 2 },
  { name: 'בונקר', requiredPerShift: 2 },
  { name: 'נשקייה', requiredPerShift: 1 },
  { name: 'תצפיתן', requiredPerShift: 1 },
  { name: 'עתודה', requiredPerShift: 1 },
];

const seedDefaultPostsForUser = async (db, userId) => {
  const existing = await db.get('SELECT COUNT(1) as count FROM posts WHERE userId = $1', [userId]);
  if (existing?.count > 0) return;
  for (const p of DEFAULT_POSTS) {
    await db.run(
      'INSERT INTO posts (name, requiredPerShift, optional, userId) VALUES ($1, $2, $3, $4)',
      [p.name, p.requiredPerShift, false, userId]
    );
  }
};

router.use(cookieParser());

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'missing fields' });
    const db = getDb(req);
    const existing = await db.get('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing) return res.status(409).json({ error: 'email exists' });
    const hash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2, $3) RETURNING id',
      [email.toLowerCase(), hash, new Date().toISOString()]
    );
    await seedDefaultPostsForUser(db, result.lastID);
    const token = signToken({ id: result.lastID, email: email.toLowerCase() });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
    res.json({ id: result.lastID, email: email.toLowerCase() });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'missing fields' });
    const db = getDb(req);
    const user = await db.get('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    await seedDefaultPostsForUser(db, user.id);
    const token = signToken({ id: user.id, email: user.email });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS, maxAge: 0 });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ id: payload.id, email: payload.email });
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
});

export default router;

