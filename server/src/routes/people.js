import express from 'express';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapPerson = row => ({
  id: row.id,
  name: row.name,
  gender: row.gender,
  sameGenderPreference: Boolean(row.sameGenderPref),
  exemptions: JSON.parse(row.exemptions || '[]'),
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await getDb(req).all('SELECT * FROM people');
    res.json(rows.map(mapPerson));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { name, gender, sameGenderPref = false, exemptions = [] } = req.body;
    const result = await db.run(
      'INSERT INTO people (name, gender, sameGenderPref, exemptions) VALUES (?, ?, ?, ?)',
      [name, gender, sameGenderPref ? 1 : 0, JSON.stringify(exemptions)]
    );
    res.json({ id: result.lastID, name, gender, sameGenderPreference: sameGenderPref, exemptions });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await getDb(req).run('DELETE FROM people WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
