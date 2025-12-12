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

const shuffle = (arr = []) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const clearAssignments = (db, userId) => db.run('DELETE FROM assignments WHERE userId = ?', userId);
const clearBwAssignments = (db, userId) => db.run('DELETE FROM bw_assignments WHERE userId = ?', userId);
const clearEsAssignments = (db, userId) => db.run('DELETE FROM es_assignments WHERE userId = ?', userId);

const persistAssignments = async (db, assignments = [], userId) => {
  for (const { personId, postId, day, shiftLabel, start, end } of assignments) {
    await db.run(
      'INSERT INTO assignments (personId, postId, day, shiftLabel, startISO, endISO, userId) VALUES (?,?,?,?,?,?,?)',
      [personId, postId, day, shiftLabel, start || '', end || '', userId]
    );
  }
};

const persistBwAssignments = async (db, bwAssignments = [], userId) => {
  for (const { personId, day, slotId } of bwAssignments) {
    await db.run(
      'INSERT INTO bw_assignments (personId, day, slotId, userId) VALUES (?, ?, ?, ?)',
      [personId, day, slotId, userId]
    );
  }
};

const persistEsAssignments = async (db, esAssignments = [], userId) => {
  for (const { groupId, personIds = [] } of esAssignments) {
    for (const personId of personIds) {
      await db.run(
        'INSERT INTO es_assignments (groupId, personId, userId) VALUES (?, ?, ?)',
        [groupId, personId, userId]
      );
    }
  }
};

const persistAllAssignments = async (db, assignments = [], bwAssignments = [], esAssignments = [], userId) => {
  await Promise.all([clearAssignments(db, userId), clearBwAssignments(db, userId), clearEsAssignments(db, userId)]);
  await persistAssignments(db, assignments, userId);
  await persistBwAssignments(db, bwAssignments, userId);
  await persistEsAssignments(db, esAssignments, userId);
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
      constraints = [],
    } = req.body;

    const [peopleRows, postRows] = await Promise.all([
      db.all('SELECT * FROM people WHERE userId = ?', req.user.id),
      db.all('SELECT * FROM posts WHERE userId = ?', req.user.id),
    ]);

    const personIds = new Set(peopleRows.map(p => p.id));
    const postIds = new Set(postRows.map(p => p.id));
    const sanitizeAssignments = arr =>
      (arr || []).filter(a => personIds.has(a.personId) && postIds.has(a.postId));
    const sanitizeBw = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEs = arr =>
      (arr || []).map(es => ({
        groupId: es.groupId,
        personIds: (es.personIds || []).filter(pid => personIds.has(pid)),
      }));

    const sanitizedEs = sanitizeEs(esAssignments);
    const sanitizedAssignments = sanitizeAssignments(existingAssignments);
    const sanitizedBw = sanitizeBw(existingBwAssignments);

    const shuffledPeople = shuffle(peopleRows).map(mapPerson);

    const result = scheduleGenerator(
      shuffledPeople,
      postRows.map(mapPost),
      startISO,
      endISO,
      shiftOverrides,
      sanitizedEs,
      sanitizedAssignments,
      sanitizedBw,
      constraints
    );

    if (result.error) {
      return respondError(res, result.error);
    }

    if (result.assignments.some(a => a.personId == null || a.postId == null)) {
      return respondError(res);
    }

    await persistAllAssignments(db, result.assignments, result.bwAssignments, sanitizedEs, req.user.id);
    res.json({ assignments: result.assignments, bwAssignments: result.bwAssignments, esAssignments: sanitizedEs });
  } catch (err) {
    next(err);
  }
});

router.post('/save-all', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { assignments = [], bwAssignments = [], esAssignments = [] } = req.body;
    const [peopleRows, postRows] = await Promise.all([
      db.all('SELECT id FROM people WHERE userId = ?', req.user.id),
      db.all('SELECT id FROM posts WHERE userId = ?', req.user.id),
    ]);
    const personIds = new Set(peopleRows.map(p => p.id));
    const postIds = new Set(postRows.map(p => p.id));
    const sanitizedAssignments = assignments.filter(a => personIds.has(a.personId) && postIds.has(a.postId));
    const sanitizedBw = bwAssignments.filter(a => personIds.has(a.personId));
    const sanitizedEs = esAssignments.map(es => ({
      groupId: es.groupId,
      personIds: (es.personIds || []).filter(pid => personIds.has(pid)),
    }));
    await persistAllAssignments(db, sanitizedAssignments, sanitizedBw, sanitizedEs, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/update-cell', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { postId, day, shiftLabel, personIds = [] } = req.body;
    const post = await db.get('SELECT id FROM posts WHERE id = ? AND userId = ?', postId, req.user.id);
    if (!post) return res.status(400).json({ error: 'invalid post' });
    const peopleRows = await db.all('SELECT id FROM people WHERE userId = ?', req.user.id);
    const personSet = new Set(peopleRows.map(p => p.id));
    await db.run(
      'DELETE FROM assignments WHERE postId = ? AND day = ? AND shiftLabel = ? AND userId = ?',
      [postId, day, shiftLabel, req.user.id]
    );

    for (const personId of personIds) {
      if (!personSet.has(personId)) continue;
      await db.run(
        'INSERT INTO assignments (personId, postId, day, shiftLabel, startISO, endISO, userId) VALUES (?,?,?,?,?,?,?)',
        [personId, postId, day, shiftLabel, '', '', req.user.id]
      );
    }

    const rows = await db.all('SELECT * FROM assignments WHERE userId = ?', req.user.id);
    res.json({ ok: true, assignments: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/last', async (req, res, next) => {
  try {
    const db = getDb(req);
    const [regular, bw, es] = await Promise.all([
      db.all('SELECT * FROM assignments WHERE userId = ?', req.user.id),
      db.all('SELECT * FROM bw_assignments WHERE userId = ?', req.user.id),
      db.all('SELECT * FROM es_assignments WHERE userId = ?', req.user.id),
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
    await Promise.all([clearAssignments(db, req.user.id), clearBwAssignments(db, req.user.id), clearEsAssignments(db, req.user.id)]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
