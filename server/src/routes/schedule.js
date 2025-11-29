import express from 'express';
import { scheduleGenerator } from '../scheduler.js';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapPerson = row => ({
  ...row,
  sameGenderPref: Boolean(row.sameGenderPref),
  exemptions: JSON.parse(row.exemptions || '[]'),
});

const mapPost = row => ({
  ...row,
  optional: Boolean(row.optional),
});

const respondError = (res, message = 'not enough manpower') =>
  res.json({ assignments: [], error: message });

const clearAssignments = db => db.run('DELETE FROM assignments');

const persistAssignments = async (db, assignments) => {
  await clearAssignments(db);
  for (const { personId, postId, day, shiftLabel, start, end } of assignments) {
    await db.run(
      'INSERT INTO assignments (personId, postId, day, shiftLabel, startISO, endISO) VALUES (?,?,?,?,?,?)',
      [personId, postId, day, shiftLabel, start || '', end || '']
    );
  }
};

router.post('/generate', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { startISO, endISO, shiftOverrides = [], esAssignments = [], existingAssignments = [] } = req.body;

    const [peopleRows, postRows] = await Promise.all([
      db.all('SELECT * FROM people'),
      db.all('SELECT * FROM posts'),
    ]);

    const result = scheduleGenerator(
      peopleRows.map(mapPerson),
      postRows.map(mapPost),
      startISO,
      endISO,
      shiftOverrides,
      esAssignments,
      existingAssignments
    );

    if (result.error) {
      return respondError(res, result.error);
    }

    if (result.assignments.some(a => a.personId == null || a.postId == null)) {
      return respondError(res);
    }

    await persistAssignments(db, result.assignments);
    res.json({ assignments: result.assignments });
  } catch (err) {
    next(err);
  }
});

router.post('/save-all', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { assignments = [] } = req.body;
    await persistAssignments(db, assignments);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/update-cell', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { postId, day, shiftLabel, personIds = [] } = req.body;

    await db.run(
      'DELETE FROM assignments WHERE postId = ? AND day = ? AND shiftLabel = ?',
      [postId, day, shiftLabel]
    );

    for (const personId of personIds) {
      await db.run(
        'INSERT INTO assignments (personId, postId, day, shiftLabel, startISO, endISO) VALUES (?,?,?,?,?,?)',
        [personId, postId, day, shiftLabel, '', '']
      );
    }

    const rows = await db.all('SELECT * FROM assignments');
    res.json({ ok: true, assignments: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/last', async (req, res, next) => {
  try {
    const rows = await getDb(req).all('SELECT * FROM assignments');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.delete('/clear', async (req, res, next) => {
  try {
    await clearAssignments(getDb(req));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
