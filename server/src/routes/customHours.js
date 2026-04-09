import express from 'express';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapCustomHours = row => ({
  id: row.id,
  personId: Number(row.personid),
  date: row.date,
  reason: row.reason,
  hours: Number(row.hours),
});

router.get('/', async (req, res, next) => {
  try {
    const db = getDb(req);
    // Check if table exists
    const tableSet = await db.all(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'custom_hours'"
    );
    if (!tableSet || tableSet.length === 0) {
      return res.json([]);
    }
    const rows = await db.all('SELECT * FROM custom_hours WHERE userId = $1', [req.user.id]);
    res.json(rows.map(mapCustomHours));
  } catch (err) {
    next(err);
  }
});

router.get('/person/:personId', async (req, res, next) => {
  try {
    const db = getDb(req);
    // Check if table exists
    const tableSet = await db.all(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'custom_hours'"
    );
    if (!tableSet || tableSet.length === 0) {
      return res.json([]);
    }
    const personId = Number(req.params.personId);
    const rows = await db.all(
      'SELECT * FROM custom_hours WHERE personId = $1 AND userId = $2',
      [personId, req.user.id]
    );
    res.json(rows.map(mapCustomHours));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const db = getDb(req);
    // Check if table exists, if not create it
    const tableSet = await db.all(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'custom_hours'"
    );
    if (!tableSet || tableSet.length === 0) {
      await db.run(`
        CREATE TABLE IF NOT EXISTS custom_hours (
          id SERIAL PRIMARY KEY,
          personId INTEGER NOT NULL,
          date TEXT NOT NULL,
          reason TEXT NOT NULL,
          hours NUMERIC NOT NULL,
          userId INTEGER REFERENCES users(id)
        );
      `);
    }
    
    const { personId, date, reason, hours } = req.body;
    
    // Validate personId belongs to user
    const owned = await db.get('SELECT id FROM people WHERE id = $1 AND userId = $2', [personId, req.user.id]);
    if (!owned) return res.status(400).json({ error: 'invalid person' });
    
    // Validate hours is a number
    const hoursNum = Number(hours);
    if (Number.isNaN(hoursNum)) return res.status(400).json({ error: 'hours must be a number' });
    
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid date format' });
    
    const result = await db.run(
      'INSERT INTO custom_hours (personId, date, reason, hours, userId) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [personId, date, reason || '', hoursNum, req.user.id]
    );
    res.json({ id: result.lastID, personId, date, reason: reason || '', hours: hoursNum });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const db = getDb(req);
    const id = Number(req.params.id);
    const { date, reason, hours } = req.body;
    
    // Validate hours is a number
    const hoursNum = Number(hours);
    if (Number.isNaN(hoursNum)) return res.status(400).json({ error: 'hours must be a number' });
    
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid date format' });
    
    // Check ownership
    const existing = await db.get('SELECT id FROM custom_hours WHERE id = $1 AND userId = $2', [id, req.user.id]);
    if (!existing) return res.status(404).json({ error: 'not found' });
    
    await db.run(
      'UPDATE custom_hours SET date = $1, reason = $2, hours = $3 WHERE id = $4 AND userId = $5',
      [date, reason || '', hoursNum, id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await getDb(req).run('DELETE FROM custom_hours WHERE id = $1 AND userId = $2', [Number(req.params.id), req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

