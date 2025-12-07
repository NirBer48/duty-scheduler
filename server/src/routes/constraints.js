import express from 'express';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapConstraint = row => ({
  id: row.id,
  personId: Number(row.personId),
  title: row.title,
  startISO: row.startISO,
  endISO: row.endISO,
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await getDb(req).all('SELECT * FROM constraints');
    res.json(rows.map(mapConstraint));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { personId, title, startISO, endISO } = req.body;
    const result = await db.run(
      'INSERT INTO constraints (personId, title, startISO, endISO) VALUES (?, ?, ?, ?)',
      [personId, title, startISO, endISO]
    );
    res.json({ id: result.lastID, personId, title, startISO, endISO });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await getDb(req).run('DELETE FROM constraints WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

