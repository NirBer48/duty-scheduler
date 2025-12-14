import express from 'express';
import { scheduleGenerator } from '../scheduler.js';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapPerson = row => ({
  ...row,
  sameGenderPref: Boolean(row.samegenderpref),
  limitedAbility: Boolean(row.limitedability),
  standingExemption: Boolean(row.standingexemption),
});

const mapPost = row => ({
  id: row.id,
  name: row.name,
  requiredPerShift: row.requiredpershift,
  optional: Boolean(row.optional),
});

const mapAssignment = row => ({
  postId: Number(row.postid),
  personId: Number(row.personid),
  shiftLabel: row.shiftlabel,
  start: row.startiso,
  end: row.endiso,
  day: row.day,
});

const mapBwAssignment = row => ({
  personId: Number(row.personid),
  day: row.day,
  slotId: row.slotid,
});

const mapEsAssignmentRows = rows => {
  const grouped = rows.reduce((acc, row) => {
    const groupId = row.groupid;
    if (!acc[groupId]) acc[groupId] = [];
    acc[groupId].push(Number(row.personid));
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

const clearAssignments = (db, userId) => db.run('DELETE FROM assignments WHERE userId = $1', [userId]);
const clearBwAssignments = (db, userId) => db.run('DELETE FROM bw_assignments WHERE userId = $1', [userId]);
const clearEsAssignments = (db, userId) => db.run('DELETE FROM es_assignments WHERE userId = $1', [userId]);

const persistAssignments = async (db, assignments = [], userId) => {
  for (const { personId, postId, day, shiftLabel, start, end } of assignments) {
    await db.run(
      'INSERT INTO assignments (personId, postId, day, shiftLabel, startISO, endISO, userId) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [personId, postId, day, shiftLabel, start || '', end || '', userId]
    );
  }
};

const persistBwAssignments = async (db, bwAssignments = [], userId) => {
  for (const { personId, day, slotId } of bwAssignments) {
    await db.run(
      'INSERT INTO bw_assignments (personId, day, slotId, userId) VALUES ($1, $2, $3, $4)',
      [personId, day, slotId, userId]
    );
  }
};

const persistEsAssignments = async (db, esAssignments = [], userId) => {
  for (const { groupId, personIds = [] } of esAssignments) {
    for (const personId of personIds) {
      await db.run(
        'INSERT INTO es_assignments (groupId, personId, userId) VALUES ($1, $2, $3)',
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
      db.all('SELECT * FROM people WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM posts WHERE userId = $1', [req.user.id]),
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
      db.all('SELECT id FROM people WHERE userId = $1', [req.user.id]),
      db.all('SELECT id FROM posts WHERE userId = $1', [req.user.id]),
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
    const post = await db.get('SELECT id FROM posts WHERE id = $1 AND userId = $2', [postId, req.user.id]);
    if (!post) return res.status(400).json({ error: 'invalid post' });
    const peopleRows = await db.all('SELECT id FROM people WHERE userId = $1', [req.user.id]);
    const personSet = new Set(peopleRows.map(p => p.id));
    await db.run(
      'DELETE FROM assignments WHERE postId = $1 AND day = $2 AND shiftLabel = $3 AND userId = $4',
      [postId, day, shiftLabel, req.user.id]
    );

    for (const personId of personIds) {
      if (!personSet.has(personId)) continue;
      await db.run(
        'INSERT INTO assignments (personId, postId, day, shiftLabel, startISO, endISO, userId) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [personId, postId, day, shiftLabel, '', '', req.user.id]
      );
    }

    const rows = await db.all('SELECT * FROM assignments WHERE userId = $1', [req.user.id]);
    res.json({ ok: true, assignments: rows.map(mapAssignment) });
  } catch (err) {
    next(err);
  }
});

router.get('/last', async (req, res, next) => {
  try {
    const db = getDb(req);
    const [regular, bw, es] = await Promise.all([
      db.all('SELECT * FROM assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM bw_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM es_assignments WHERE userId = $1', [req.user.id]),
    ]);
    res.json({
      assignments: regular.map(mapAssignment),
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
