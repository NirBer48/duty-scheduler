import express from 'express';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapConstraint = row => ({
  id: row.id,
  personId: Number(row.personid),
  title: row.title,
  startISO: row.startiso,
  endISO: row.endiso,
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await getDb(req).all('SELECT * FROM constraints WHERE userId = $1', [req.user.id]);
    res.json(rows.map(mapConstraint));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { personId, title, startISO, endISO } = req.body;
    const owned = await db.get('SELECT id FROM people WHERE id = $1 AND userId = $2', [personId, req.user.id]);
    if (!owned) return res.status(400).json({ error: 'invalid person' });
    const result = await db.run(
      'INSERT INTO constraints (personId, title, startISO, endISO, userId) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [personId, title, startISO, endISO, req.user.id]
    );
    res.json({ id: result.lastID, personId, title, startISO, endISO });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await getDb(req).run('DELETE FROM constraints WHERE id = $1 AND userId = $2', [Number(req.params.id), req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

