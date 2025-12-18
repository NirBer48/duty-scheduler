import express from 'express';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapPerson = row => ({
  id: row.id,
  name: row.name,
  gender: row.gender,
  sameGenderPreference: Boolean(row.samegenderpref),
  limitedAbility: Boolean(row.limitedability),
  standingExemption: Boolean(row.standingexemption),
  duelGuard: Boolean(row.duelguard),
});

router.get('/', async (req, res, next) => {
  try {
    const rows = await getDb(req).all('SELECT * FROM people WHERE userId = $1', [req.user.id]);
    res.json(rows.map(mapPerson));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { name, gender, sameGenderPref = false, limitedAbility = false, standingExemption = false, duelGuard = false } = req.body;
    const result = await db.run(
      'INSERT INTO people (name, gender, sameGenderPref, limitedAbility, standingExemption, duelGuard, userId) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [name, gender, !!sameGenderPref, !!limitedAbility, !!standingExemption, !!duelGuard, req.user.id]
    );
    res.json({
      id: result.lastID,
      name,
      gender,
      sameGenderPreference: sameGenderPref,
      limitedAbility,
      standingExemption,
      duelGuard,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb(req);
    const id = Number(req.params.id);
    // Remove related assignments (regular, BW, ES) before deleting the person
    await db.run('DELETE FROM assignments WHERE personId = $1 AND userId = $2', [id, req.user.id]);
    await db.run('DELETE FROM bw_assignments WHERE personId = $1 AND userId = $2', [id, req.user.id]);
    await db.run('DELETE FROM es_assignments WHERE personId = $1 AND userId = $2', [id, req.user.id]);
    await db.run('DELETE FROM people WHERE id = $1 AND userId = $2', [id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
