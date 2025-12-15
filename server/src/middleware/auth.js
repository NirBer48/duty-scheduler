import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.AUTH_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'auth_token';

export const requireAuth = (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
};

export const attachUserIfPresent = (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, email: payload.email };
  } catch {
    // ignore
  }
  next();
};

