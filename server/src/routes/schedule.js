import express from 'express';
import { scheduleGenerator } from '../scheduler.js';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapPerson = row => ({
  ...row,
  sameGenderPref: Boolean(row.sameGenderPref),
  limitedAbility: Boolean(row.limitedAbility),
  standingExemption: Boolean(row.standingExemption),
});

const mapPost = row => ({
  ...row,
  optional: Boolean(row.optional),
});

const mapBwAssignment = row => ({
  personId: Number(row.personId),
  day: row.day,
  slotId: row.slotId,
});

const mapEsAssignmentRows = rows => {
  const grouped = rows.reduce((acc, row) => {
    const groupId = row.groupId;
    if (!acc[groupId]) acc[groupId] = [];
    acc[groupId].push(Number(row.personId));
    return acc;
  }, {});
  return Object.entries(grouped).map(([groupId, personIds]) => ({
    groupId,
    personIds,
  }));
};

const respondError = (res, message = 'not enough manpower') =>
  res.json({ assignments: [], bwAssignments: [], esAssignments: [], error: message });

const clearAssignments = db => db.run('DELETE FROM assignments');
const clearBwAssignments = db => db.run('DELETE FROM bw_assignments');
const clearEsAssignments = db => db.run('DELETE FROM es_assignments');

const persistAssignments = async (db, assignments = []) => {
  for (const { personId, postId, day, shiftLabel, start, end } of assignments) {
    await db.run(
      'INSERT INTO assignments (personId, postId, day, shiftLabel, startISO, endISO) VALUES (?,?,?,?,?,?)',
      [personId, postId, day, shiftLabel, start || '', end || '']
    );
  }
};

const persistBwAssignments = async (db, bwAssignments = []) => {
  for (const { personId, day, slotId } of bwAssignments) {
    await db.run(
      'INSERT INTO bw_assignments (personId, day, slotId) VALUES (?, ?, ?)',
      [personId, day, slotId]
    );
  }
};

const persistEsAssignments = async (db, esAssignments = []) => {
  for (const { groupId, personIds = [] } of esAssignments) {
    for (const personId of personIds) {
      await db.run(
        'INSERT INTO es_assignments (groupId, personId) VALUES (?, ?)',
        [groupId, personId]
      );
    }
  }
};

const persistAllAssignments = async (db, assignments = [], bwAssignments = [], esAssignments = []) => {
  await Promise.all([clearAssignments(db), clearBwAssignments(db), clearEsAssignments(db)]);
  await persistAssignments(db, assignments);
  await persistBwAssignments(db, bwAssignments);
  await persistEsAssignments(db, esAssignments);
};

router.post('/generate', async (req, res, next) => {
  try {
    const db = getDb(req);
    const {
      startISO,
      endISO,
      shiftOverrides = [],
      esAssignments = [],
      existingAssignments = [],
      existingBwAssignments = [],
    } = req.body;

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
      existingAssignments,
      existingBwAssignments
    );

    if (result.error) {
      return respondError(res, result.error);
    }

    if (result.assignments.some(a => a.personId == null || a.postId == null)) {
      return respondError(res);
    }

    await persistAllAssignments(db, result.assignments, result.bwAssignments, esAssignments);
    res.json({ assignments: result.assignments, bwAssignments: result.bwAssignments, esAssignments });
  } catch (err) {
    next(err);
  }
});

router.post('/save-all', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { assignments = [], bwAssignments = [], esAssignments = [] } = req.body;
    await persistAllAssignments(db, assignments, bwAssignments, esAssignments);
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
    const db = getDb(req);
    const [regular, bw, es] = await Promise.all([
      db.all('SELECT * FROM assignments'),
      db.all('SELECT * FROM bw_assignments'),
      db.all('SELECT * FROM es_assignments'),
    ]);
    res.json({
      assignments: regular,
      bwAssignments: bw.map(mapBwAssignment),
      esAssignments: mapEsAssignmentRows(es),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/clear', async (req, res, next) => {
  try {
    const db = getDb(req);
    await Promise.all([clearAssignments(db), clearBwAssignments(db), clearEsAssignments(db)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
