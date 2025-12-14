import express from 'express';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapPost = row => ({
  id: row.id,
  name: row.name,
  requiredPerShift: row.requiredpershift,
  optional: Boolean(row.optional),
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await getDb(req).all('SELECT * FROM posts WHERE userId = $1', [req.user.id]);
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
      'INSERT INTO posts (name, requiredPerShift, optional, userId) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, requiredPerShift, !!optional, req.user.id]
    );
    res.json(mapPost({ id: result.lastID, name, requiredPerShift, optional }));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await getDb(req).run('DELETE FROM posts WHERE id = $1 AND userId = $2', [Number(req.params.id), req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
