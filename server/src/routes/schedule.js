import express from 'express';
import { scheduleGenerator } from '../scheduler.js';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapPerson = row => ({
  ...row,
  sameGenderPref: Boolean(row.samegenderpref),
  limitedAbility: Boolean(row.limitedability),
  standingExemption: Boolean(row.standingexemption),
  duelGuard: Boolean(row.duelguard),
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

// BW slot definitions (must match client/src/components/schedule/utils.ts)
const BW_SLOT_DEFINITIONS = [
  { id: 'bw_morning', startHour: 8, startMinute: 30, endHour: 11, endMinute: 30 },
  { id: 'bw_afternoon', startHour: 13, startMinute: 30, endHour: 17, endMinute: 30 },
  { id: 'bw_evening', startHour: 18, startMinute: 30, endHour: 20, endMinute: 0 },
];

const isBwSlotInRange = (day, slotId, rangeStart, rangeEnd) => {
  const slot = BW_SLOT_DEFINITIONS.find(s => s.id === slotId);
  if (!slot) return false;

  const dayDate = new Date(day + 'T00:00:00.000Z');
  const slotStart = new Date(dayDate);
  slotStart.setUTCHours(slot.startHour, slot.startMinute, 0, 0);

  const slotEnd = new Date(dayDate);
  slotEnd.setUTCHours(slot.endHour, slot.endMinute, 0, 0);

  // Handle slots that might span midnight
  if (slotEnd <= slotStart) {
    slotEnd.setUTCDate(slotEnd.getUTCDate() + 1);
  }

  // Check overlap: slot overlaps with range if slotEnd > rangeStart AND slotStart < rangeEnd
  return slotEnd > rangeStart && slotStart < rangeEnd;
};

const archiveAssignments = async (db, assignments = [], bwAssignments = [], esAssignments = [], userId, start, end) => {
  // Extract date part without timezone conversion: "2025-12-17T20:00" -> "2025-12-17"
  const scheduleStart = start.substring(0, 10);
  const scheduleEnd = end.substring(0, 10);
  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  // Filter assignments to only include those within the time range
  const filteredAssignments = assignments.filter(a => {
    if (!a.start || !a.end) return true; // Include if no times (shouldn't happen)
    const aStart = new Date(a.start);
    const aEnd = new Date(a.end);
    // Check overlap: assignment overlaps with range
    return aEnd > rangeStart && aStart < rangeEnd;
  });

  // Filter BW assignments to only include those within the time range
  const filteredBwAssignments = bwAssignments.filter(b =>
    isBwSlotInRange(b.day, b.slotId, rangeStart, rangeEnd)
  );

  console.log('Archiving period:', scheduleStart, '-', scheduleEnd);
  console.log('Assignments:', assignments.length, '-> filtered:', filteredAssignments.length);
  console.log('BW assignments:', bwAssignments.length, '-> filtered:', filteredBwAssignments.length);

  // Clear existing archives for this schedule period
  await db.run('DELETE FROM archived_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);
  await db.run('DELETE FROM archived_bw_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);
  await db.run('DELETE FROM archived_es_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);

  // Insert new archives (filtered)
  for (const a of filteredAssignments) {
    await db.run(
      'INSERT INTO archived_assignments (schedule_start, schedule_end, personId, postId, day, shiftLabel, startISO, endISO, userId) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [scheduleStart, scheduleEnd, a.personId, a.postId, a.day, a.shiftLabel, a.start ? a.start : null, a.end ? a.end : null, userId]
    );
  }
  for (const b of filteredBwAssignments) {
    await db.run(
      'INSERT INTO archived_bw_assignments (schedule_start, schedule_end, personId, day, slotId, userId) VALUES ($1, $2, $3, $4, $5, $6)',
      [scheduleStart, scheduleEnd, b.personId, b.day, b.slotId, userId]
    );
  }
  for (const es of esAssignments) {
    for (const personId of es.personIds || []) {
      await db.run(
        'INSERT INTO archived_es_assignments (schedule_start, schedule_end, groupId, personId, userId) VALUES ($1, $2, $3, $4, $5)',
        [scheduleStart, scheduleEnd, es.groupId, personId, userId]
      );
    }
  }
  console.log('Archived successfully');
};

const persistAllAssignments = async (db, assignments = [], bwAssignments = [], esAssignments = [], userId, start, end) => {
  await Promise.all([clearAssignments(db, userId), clearBwAssignments(db, userId), clearEsAssignments(db, userId)]);
  await persistAssignments(db, assignments, userId);
  await persistBwAssignments(db, bwAssignments, userId);
  await persistEsAssignments(db, esAssignments, userId);
  // Archive the saved assignments
  await archiveAssignments(db, assignments, bwAssignments, esAssignments, userId, start, end);
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

    await persistAllAssignments(db, result.assignments, result.bwAssignments, sanitizedEs, req.user.id, startISO, endISO);
    res.json({ assignments: result.assignments, bwAssignments: result.bwAssignments, esAssignments: sanitizedEs });
  } catch (err) {
    next(err);
  }
});

router.post('/save-all', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { assignments = [], bwAssignments = [], esAssignments = [], start, end } = req.body;
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
    await persistAllAssignments(db, sanitizedAssignments, sanitizedBw, sanitizedEs, req.user.id, start, end);
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

router.get('/history-periods', async (req, res, next) => {
  try {
    const db = getDb(req);
    // Query each table separately and combine results
    // Cast DATE to TEXT to avoid timezone conversion issues
    const [assignmentPeriods, bwPeriods, esPeriods] = await Promise.all([
      db.all(`
        SELECT DISTINCT schedule_start::TEXT, schedule_end::TEXT
        FROM archived_assignments
        WHERE userId = $1
      `, [req.user.id]),
      db.all(`
        SELECT DISTINCT schedule_start::TEXT, schedule_end::TEXT
        FROM archived_bw_assignments
        WHERE userId = $1
      `, [req.user.id]),
      db.all(`
        SELECT DISTINCT schedule_start::TEXT, schedule_end::TEXT
        FROM archived_es_assignments
        WHERE userId = $1
      `, [req.user.id]),
    ]);
    
    // Combine and deduplicate by creating a map
    const periodMap = new Map();
    const allPeriods = [...assignmentPeriods, ...bwPeriods, ...esPeriods];
    for (const p of allPeriods) {
      const key = `${p.schedule_start}|${p.schedule_end}`;
      if (!periodMap.has(key)) {
        periodMap.set(key, { start: p.schedule_start, end: p.schedule_end });
      }
    }
    
    // Sort by start date descending
    const periods = Array.from(periodMap.values()).sort((a, b) => 
      new Date(b.start) - new Date(a.start)
    );
    
    res.json({ periods });
  } catch (err) {
    console.error('Error in history-periods:', err.message);
    next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query parameters required' });
    }
    console.log('Fetching history for period:', start, 'to', end, 'userId:', req.user.id);
    const [regular, bw, es] = await Promise.all([
      db.all(`SELECT * FROM archived_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3`, [start, end, req.user.id]),
      db.all('SELECT * FROM archived_bw_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_es_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
    ]);
    console.log('Found assignments:', regular.length, 'bw:', bw.length, 'es:', es.length);
    res.json({
      assignments: regular.map(row => ({
        postId: Number(row.postid),
        personId: Number(row.personid),
        shiftLabel: row.shiftlabel,
        start: row.startiso,
        end: row.endiso,
        day: row.day,
      })),
      bwAssignments: bw.map(row => ({
        personId: Number(row.personid),
        day: row.day,
        slotId: row.slotid,
      })),
      esAssignments: Object.entries(es.reduce((acc, row) => {
        const groupId = row.groupid;
        if (!acc[groupId]) acc[groupId] = [];
        acc[groupId].push(Number(row.personid));
        return acc;
      }, {})).map(([groupId, personIds]) => ({
        groupId,
        personIds,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
