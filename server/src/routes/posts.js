import express from 'express';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapPost = row => ({
  id: row.id,
  name: row.name,
  requiredPerShift: row.requiredPerShift,
  optional: Boolean(row.optional),
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await getDb(req).all('SELECT * FROM posts WHERE userId = ?', req.user.id);
    res.json(rows.map(mapPost));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { name, requiredPerShift = 1, optional = false } = req.body;
    const result = await db.run(
      'INSERT INTO posts (name, requiredPerShift, optional, userId) VALUES (?, ?, ?, ?)',
      [name, requiredPerShift, optional ? 1 : 0, req.user.id]
    );
    res.json(mapPost({ id: result.lastID, name, requiredPerShift, optional }));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await getDb(req).run('DELETE FROM posts WHERE id = ? AND userId = ?', Number(req.params.id), req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
