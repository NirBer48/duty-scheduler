import express from 'express';
const router = express.Router();

router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  const rows = await db.all('SELECT * FROM people');
  const people = rows.map(r => ({ 
    id: r.id,
    name: r.name,
    gender: r.gender,
    sameGenderPreference: !!r.sameGenderPref, 
    exemptions: JSON.parse(r.exemptions || '[]') 
  }));
  res.json(people);
});

router.post('/', async (req, res) => {
  const db = req.app.locals.db;
  const { name, gender, sameGenderPref = false, exemptions = [] } = req.body;
  const result = await db.run('INSERT INTO people (name, gender, sameGenderPref, exemptions) VALUES (?, ?, ?, ?)', [name, gender, sameGenderPref ? 1 : 0, JSON.stringify(exemptions)]);
  const id = result.lastID;
  res.json({ id, name, gender, sameGenderPreference: sameGenderPref, exemptions });
});

router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  const id = Number(req.params.id);
  await db.run('DELETE FROM people WHERE id = ?', id);
  res.json({ ok: true });
});

export default router;
