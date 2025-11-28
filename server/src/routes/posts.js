import express from 'express';
const router = express.Router();

router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  const rows = await db.all('SELECT * FROM posts');
  const posts = rows.map(r => ({ ...r, optional: !!r.optional }));
  res.json(posts);
});

router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const { name, requiredPerShift = 1, optional = false } = req.body;
  const result = await db.run('INSERT INTO posts (name, requiredPerShift, optional) VALUES (?, ?, ?)', [name, requiredPerShift, optional ? 1 : 0]);
  const id = result.lastID;
  res.json({ id, name, requiredPerShift, optional });
});

router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const id = Number(req.params.id);
  await db.run('DELETE FROM posts WHERE id = ?', id);
  res.json({ ok: true });
});

export default router;
