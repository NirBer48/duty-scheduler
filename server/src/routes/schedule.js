import express from 'express';
import { scheduleGenerator } from '../scheduler.js';

const router = express.Router();
const getDb = req => req.app.locals.db;

const mapPerson = row => ({
  ...row,
  sameGenderPref: Boolean(row.samegenderpref || row.sameGenderPref),
  limitedAbility: Boolean(row.limitedability || row.limitedAbility),
  standingExemption: Boolean(row.standingexemption || row.standingExemption),
  duelGuard: Boolean(row.duelguard || row.duelGuard),
  nightGuardExemption: Boolean(row.nightguardexemption || row.nightGuardExemption),
});

const mapPost = row => ({
  id: row.id,
  name: row.name,
  requiredPerShift: row.requiredpershift,
  optional: Boolean(row.optional),
});

// Internal helper: normalize IDs coming from Postgres (may be strings) for the scheduler algorithm.
// This does NOT change what we persist or return to clients; it only prevents string/number mismatches
// inside the scheduling logic.
const toSchedulerPerson = row => ({
  ...mapPerson(row),
  id: Number(row.id),
});

const toSchedulerPost = row => ({
  ...mapPost(row),
  id: Number(row.id),
  requiredPerShift: Number(row.requiredpershift ?? row.requiredPerShift ?? 1),
});

// Internal helper: type-agnostic ID comparison (string vs number) when sanitizing incoming payloads.
const idKey = v => String(v);

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

const mapKitchenAssignment = row => ({
  personId: Number(row.personid),
  day: row.day,
  shiftId: row.shiftid,
});

const mapEscortAssignment = row => ({
  personId: Number(row.personid),
  day: row.day,
  shiftId: row.shiftid,
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

const respondError = (res, message = 'not enough manpower', missingCount = null) =>
  res.json({
    assignments: [],
    bwAssignments: [],
    esAssignments: [],
    kitchenAssignments: [],
    escortAssignments: [],
    kitchenSettings: { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' },
    escortSettings: { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 },
    error: message,
    missingCount,
  });

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
const clearKitchenAssignments = (db, userId) => db.run('DELETE FROM kitchen_assignments WHERE userId = $1', [userId]);
const clearEscortAssignments = (db, userId) => db.run('DELETE FROM escort_assignments WHERE userId = $1', [userId]);

const upsertKitchenSettings = async (db, userId, kitchenSettings) => {
  const requiredPerShift = Number(kitchenSettings?.requiredPerShift ?? 36); // backward compat
  const requiredShift1 = Number(kitchenSettings?.requiredShift1 ?? requiredPerShift ?? 36);
  const requiredShift2 = Number(kitchenSettings?.requiredShift2 ?? requiredPerShift ?? 36);
  const shift2Start = (kitchenSettings?.shift2Start ?? '13:00').toString();
  await db.run('DELETE FROM kitchen_settings WHERE userId = $1', [userId]);
  await db.run(
    'INSERT INTO kitchen_settings (requiredPerShift, requiredShift1, requiredShift2, shift2Start, userId) VALUES ($1, $2, $3, $4, $5)',
    [requiredPerShift, requiredShift1, requiredShift2, shift2Start, userId]
  );
};

const upsertEscortSettings = async (db, userId, escortSettings) => {
  const requiredPerShift = Number(escortSettings?.requiredPerShift ?? 4); // backward compat
  const requiredShift1 = Number(escortSettings?.requiredShift1 ?? requiredPerShift ?? 4);
  const requiredShift2 = Number(escortSettings?.requiredShift2 ?? requiredPerShift ?? 4);
  const requiredShift3 = Number(escortSettings?.requiredShift3 ?? requiredPerShift ?? 4);
  const requiredShift4 = Number(escortSettings?.requiredShift4 ?? requiredPerShift ?? 4);
  await db.run('DELETE FROM escort_settings WHERE userId = $1', [userId]);
  await db.run(
    'INSERT INTO escort_settings (requiredPerShift, requiredShift1, requiredShift2, requiredShift3, requiredShift4, userId) VALUES ($1, $2, $3, $4, $5, $6)',
    [requiredPerShift, requiredShift1, requiredShift2, requiredShift3, requiredShift4, userId]
  );
};

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

const persistKitchenAssignments = async (db, kitchenAssignments = [], userId) => {
  for (const { personId, day, shiftId } of kitchenAssignments) {
    await db.run(
      'INSERT INTO kitchen_assignments (personId, day, shiftId, userId) VALUES ($1, $2, $3, $4)',
      [personId, day, shiftId, userId]
    );
  }
};

const persistEscortAssignments = async (db, escortAssignments = [], userId) => {
  for (const { personId, day, shiftId } of escortAssignments) {
    await db.run(
      'INSERT INTO escort_assignments (personId, day, shiftId, userId) VALUES ($1, $2, $3, $4)',
      [personId, day, shiftId, userId]
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

const archiveAssignments = async (
  db,
  assignments = [],
  bwAssignments = [],
  esAssignments = [],
  kitchenAssignments = [],
  escortAssignments = [],
  kitchenSettings,
  escortSettings,
  userId,
  start,
  end
) => {
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
  await db.run('DELETE FROM archived_kitchen_settings WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);
  await db.run('DELETE FROM archived_kitchen_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);
  await db.run('DELETE FROM archived_escort_settings WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);
  await db.run('DELETE FROM archived_escort_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);

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

  const ks = kitchenSettings || { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' };
  const ks1 = Number(ks.requiredShift1 ?? ks.requiredPerShift ?? 36);
  const ks2 = Number(ks.requiredShift2 ?? ks.requiredPerShift ?? 36);
  await db.run(
    'INSERT INTO archived_kitchen_settings (schedule_start, schedule_end, requiredPerShift, requiredShift1, requiredShift2, shift2Start, userId) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [
      scheduleStart,
      scheduleEnd,
      Number(ks.requiredPerShift ?? 36),
      ks1,
      ks2,
      (ks.shift2Start ?? '13:00').toString(),
      userId
    ]
  );

  for (const k of kitchenAssignments || []) {
    await db.run(
      'INSERT INTO archived_kitchen_assignments (schedule_start, schedule_end, personId, day, shiftId, userId) VALUES ($1, $2, $3, $4, $5, $6)',
      [scheduleStart, scheduleEnd, Number(k.personId), k.day, k.shiftId, userId]
    );
  }

  const esSet = escortSettings || { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 };
  const es1 = Number(esSet.requiredShift1 ?? esSet.requiredPerShift ?? 4);
  const es2 = Number(esSet.requiredShift2 ?? esSet.requiredPerShift ?? 4);
  const es3 = Number(esSet.requiredShift3 ?? esSet.requiredPerShift ?? 4);
  const es4 = Number(esSet.requiredShift4 ?? esSet.requiredPerShift ?? 4);
  await db.run(
    'INSERT INTO archived_escort_settings (schedule_start, schedule_end, requiredPerShift, requiredShift1, requiredShift2, requiredShift3, requiredShift4, userId) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [scheduleStart, scheduleEnd, Number(esSet.requiredPerShift ?? 4), es1, es2, es3, es4, userId]
  );

  for (const e of escortAssignments || []) {
    await db.run(
      'INSERT INTO archived_escort_assignments (schedule_start, schedule_end, personId, day, shiftId, userId) VALUES ($1, $2, $3, $4, $5, $6)',
      [scheduleStart, scheduleEnd, Number(e.personId), e.day, e.shiftId, userId]
    );
  }
  console.log('Archived successfully');
};

const persistAllAssignments = async (
  db,
  assignments = [],
  bwAssignments = [],
  esAssignments = [],
  kitchenAssignments = [],
  escortAssignments = [],
  kitchenSettings,
  escortSettings,
  userId,
  start,
  end
) => {
  await Promise.all([
    clearAssignments(db, userId),
    clearBwAssignments(db, userId),
    clearEsAssignments(db, userId),
    clearKitchenAssignments(db, userId),
    clearEscortAssignments(db, userId),
  ]);
  await persistAssignments(db, assignments, userId);
  await persistBwAssignments(db, bwAssignments, userId);
  await persistEsAssignments(db, esAssignments, userId);
  await persistKitchenAssignments(db, kitchenAssignments, userId);
  await persistEscortAssignments(db, escortAssignments, userId);
  await upsertKitchenSettings(db, userId, kitchenSettings);
  await upsertEscortSettings(db, userId, escortSettings);
  // Archive the saved assignments
  await archiveAssignments(
    db,
    assignments,
    bwAssignments,
    esAssignments,
    kitchenAssignments,
    escortAssignments,
    kitchenSettings,
    escortSettings,
    userId,
    start,
    end
  );
};

const persistGuardsOnly = async (db, assignments = [], bwAssignments = [], esAssignments = [], userId) => {
  await Promise.all([clearAssignments(db, userId), clearBwAssignments(db, userId), clearEsAssignments(db, userId)]);
  await persistAssignments(db, assignments, userId);
  await persistBwAssignments(db, bwAssignments, userId);
  await persistEsAssignments(db, esAssignments, userId);
};

const persistKitchenOnly = async (
  db,
  kitchenAssignments = [],
  escortAssignments = [],
  kitchenSettings,
  escortSettings,
  userId
) => {
  await Promise.all([clearKitchenAssignments(db, userId), clearEscortAssignments(db, userId)]);
  await persistKitchenAssignments(db, kitchenAssignments, userId);
  await persistEscortAssignments(db, escortAssignments, userId);
  await upsertKitchenSettings(db, userId, kitchenSettings);
  await upsertEscortSettings(db, userId, escortSettings);
};

const fetchKitchenEscortSnapshot = async (db, userId) => {
  const [kitchen, escort, kitchenSettingsRows, escortSettingsRows] = await Promise.all([
    db.all('SELECT * FROM kitchen_assignments WHERE userId = $1', [userId]),
    db.all('SELECT * FROM escort_assignments WHERE userId = $1', [userId]),
    db.all('SELECT * FROM kitchen_settings WHERE userId = $1 LIMIT 1', [userId]),
    db.all('SELECT * FROM escort_settings WHERE userId = $1 LIMIT 1', [userId]),
  ]);
  const kitchenSettings = kitchenSettingsRows?.[0]
    ? {
      requiredShift1: Number(kitchenSettingsRows[0].requiredshift1 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
      requiredShift2: Number(kitchenSettingsRows[0].requiredshift2 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
      shift2Start: kitchenSettingsRows[0].shift2start
    }
    : { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' };
  const escortSettings = escortSettingsRows?.[0]
    ? {
      requiredShift1: Number(escortSettingsRows[0].requiredshift1 ?? escortSettingsRows[0].requiredpershift ?? 4),
      requiredShift2: Number(escortSettingsRows[0].requiredshift2 ?? escortSettingsRows[0].requiredpershift ?? 4),
      requiredShift3: Number(escortSettingsRows[0].requiredshift3 ?? escortSettingsRows[0].requiredpershift ?? 4),
      requiredShift4: Number(escortSettingsRows[0].requiredshift4 ?? escortSettingsRows[0].requiredpershift ?? 4),
    }
    : { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 };
  return {
    kitchenAssignments: kitchen.map(mapKitchenAssignment),
    escortAssignments: escort.map(mapEscortAssignment),
    kitchenSettings,
    escortSettings,
  };
};

const fetchGuardsSnapshot = async (db, userId) => {
  const [regular, bw, es] = await Promise.all([
    db.all('SELECT * FROM assignments WHERE userId = $1', [userId]),
    db.all('SELECT * FROM bw_assignments WHERE userId = $1', [userId]),
    db.all('SELECT * FROM es_assignments WHERE userId = $1', [userId]),
  ]);
  return {
    assignments: regular.map(mapAssignment),
    bwAssignments: bw.map(mapBwAssignment),
    esAssignments: mapEsAssignmentRows(es),
  };
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
      existingKitchenAssignments = [],
      existingEscortAssignments = [],
      kitchenSettings,
      escortSettings,
      constraints = [],
    } = req.body;

    const [peopleRows, postRows] = await Promise.all([
      db.all('SELECT * FROM people WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM posts WHERE userId = $1', [req.user.id]),
    ]);

    const personIds = new Set(peopleRows.map(p => idKey(p.id)));
    const postIds = new Set(postRows.map(p => idKey(p.id)));
    const sanitizeAssignments = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)) && postIds.has(idKey(a.postId)));
    const sanitizeBw = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)));
    const sanitizeKitchen = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)));
    const sanitizeEscort = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)));
    const sanitizeEs = arr =>
      (arr || []).map(es => ({
        groupId: es.groupId,
        personIds: (es.personIds || []).filter(pid => personIds.has(idKey(pid))),
      }));

    const sanitizedEs = sanitizeEs(esAssignments);
    const sanitizedAssignments = sanitizeAssignments(existingAssignments);
    const sanitizedBw = sanitizeBw(existingBwAssignments);
    const sanitizedKitchen = sanitizeKitchen(existingKitchenAssignments);
    const sanitizedEscort = sanitizeEscort(existingEscortAssignments);

    const shuffledPeople = shuffle(peopleRows).map(toSchedulerPerson);

    const result = scheduleGenerator(
      shuffledPeople,
      postRows.map(toSchedulerPost),
      startISO,
      endISO,
      shiftOverrides,
      sanitizedEs,
      sanitizedAssignments,
      sanitizedBw,
      sanitizedKitchen,
      sanitizedEscort,
      kitchenSettings,
      escortSettings,
      constraints
    );

    if (result.error) {
      return respondError(res, result.error, result.missingCount);
    }

    if (result.assignments.some(a => a.personId == null || a.postId == null)) {
      return respondError(res, 'not enough manpower', 1);
    }

    await persistAllAssignments(
      db,
      result.assignments,
      result.bwAssignments,
      sanitizedEs,
      result.kitchenAssignments || [],
      result.escortAssignments || [],
      result.kitchenSettings || kitchenSettings,
      result.escortSettings || escortSettings,
      req.user.id,
      startISO,
      endISO
    );
    res.json({
      assignments: result.assignments,
      bwAssignments: result.bwAssignments,
      esAssignments: sanitizedEs,
      kitchenAssignments: result.kitchenAssignments || [],
      escortAssignments: result.escortAssignments || [],
      kitchenSettings: result.kitchenSettings || kitchenSettings || { requiredPerShift: 36, shift2Start: '13:00' },
      escortSettings: result.escortSettings || escortSettings || { requiredPerShift: 4 },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/generate-guards', async (req, res, next) => {
  try {
    const db = getDb(req);
    const {
      startISO,
      endISO,
      shiftOverrides = [],
      esAssignments = [],
      existingAssignments = [],
      existingBwAssignments = [],
      existingKitchenAssignments = [],
      existingEscortAssignments = [],
      kitchenSettings,
      escortSettings,
      constraints = [],
      allowPartial = false,
    } = req.body;

    const [peopleRows, postRows] = await Promise.all([
      db.all('SELECT * FROM people WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM posts WHERE userId = $1', [req.user.id]),
    ]);

    const personIds = new Set(peopleRows.map(p => idKey(p.id)));
    const postIds = new Set(postRows.map(p => idKey(p.id)));
    const sanitizeAssignments = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)) && postIds.has(idKey(a.postId)));
    const sanitizeBw = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)));
    const sanitizeKitchen = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)));
    const sanitizeEscort = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)));
    const sanitizeEs = arr =>
      (arr || []).map(es => ({
        groupId: es.groupId,
        personIds: (es.personIds || []).filter(pid => personIds.has(idKey(pid))),
      }));

    const sanitizedEs = sanitizeEs(esAssignments);
    const sanitizedAssignments = sanitizeAssignments(existingAssignments);
    const sanitizedBw = sanitizeBw(existingBwAssignments);
    const sanitizedKitchen = sanitizeKitchen(existingKitchenAssignments);
    const sanitizedEscort = sanitizeEscort(existingEscortAssignments);

    const shuffledPeople = shuffle(peopleRows).map(toSchedulerPerson);

    console.log('generate-guards called with allowPartial:', allowPartial);
    
    const result = scheduleGenerator(
      shuffledPeople,
      postRows.map(toSchedulerPost),
      startISO,
      endISO,
      shiftOverrides,
      sanitizedEs,
      sanitizedAssignments,
      sanitizedBw,
      sanitizedKitchen,
      sanitizedEscort,
      kitchenSettings,
      escortSettings,
      constraints,
      { mode: 'guards', allowPartial }
    );

    console.log('scheduleGenerator result:', { 
      error: result.error, 
      missingCount: result.missingCount,
      assignmentsCount: result.assignments?.length,
      bwAssignmentsCount: result.bwAssignments?.length
    });

    if (result.error) return respondError(res, result.error, result.missingCount ?? null);

    await persistGuardsOnly(db, result.assignments, result.bwAssignments, sanitizedEs, req.user.id);

    const kitchenSnap = await fetchKitchenEscortSnapshot(db, req.user.id);
    res.json({
      assignments: result.assignments,
      bwAssignments: result.bwAssignments,
      esAssignments: sanitizedEs,
      ...kitchenSnap,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/generate-kitchen', async (req, res, next) => {
  try {
    const db = getDb(req);
    const {
      startISO,
      endISO,
      kitchenStartISO,
      kitchenEndISO,
      esAssignments = [],
      existingAssignments = [],
      existingBwAssignments = [],
      existingKitchenAssignments = [],
      existingEscortAssignments = [],
      kitchenSettings,
      escortSettings,
      constraints = [],
    } = req.body;

    const [peopleRows, postRows] = await Promise.all([
      db.all('SELECT * FROM people WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM posts WHERE userId = $1', [req.user.id]),
    ]);

    const personIds = new Set(peopleRows.map(p => idKey(p.id)));
    const postIds = new Set(postRows.map(p => idKey(p.id)));
    const sanitizeAssignments = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)) && postIds.has(idKey(a.postId)));
    const sanitizeBw = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)));
    const sanitizeKitchen = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)));
    const sanitizeEscort = arr =>
      (arr || []).filter(a => personIds.has(idKey(a.personId)));
    const sanitizeEs = arr =>
      (arr || []).map(es => ({
        groupId: es.groupId,
        personIds: (es.personIds || []).filter(pid => personIds.has(idKey(pid))),
      }));

    const sanitizedEs = sanitizeEs(esAssignments);
    const sanitizedAssignments = sanitizeAssignments(existingAssignments);
    const sanitizedBw = sanitizeBw(existingBwAssignments);
    const sanitizedKitchen = sanitizeKitchen(existingKitchenAssignments);
    const sanitizedEscort = sanitizeEscort(existingEscortAssignments);

    const shuffledPeople = shuffle(peopleRows).map(toSchedulerPerson);

    const result = scheduleGenerator(
      shuffledPeople,
      postRows.map(toSchedulerPost),
      startISO,
      endISO,
      [], // no guard overrides needed for kitchen generation
      sanitizedEs,
      sanitizedAssignments,
      sanitizedBw,
      sanitizedKitchen,
      sanitizedEscort,
      kitchenSettings,
      escortSettings,
      constraints,
      { mode: 'kitchen', kitchenStartISO, kitchenEndISO }
    );

    if (result.error) return respondError(res, result.error, result.missingCount ?? null);

    await persistKitchenOnly(
      db,
      result.kitchenAssignments || [],
      result.escortAssignments || [],
      result.kitchenSettings || kitchenSettings,
      result.escortSettings || escortSettings,
      req.user.id
    );

    const guardsSnap = await fetchGuardsSnapshot(db, req.user.id);
    res.json({
      ...guardsSnap,
      esAssignments: guardsSnap.esAssignments, // keep server truth
      kitchenAssignments: result.kitchenAssignments || [],
      escortAssignments: result.escortAssignments || [],
      kitchenSettings: result.kitchenSettings || kitchenSettings || { requiredPerShift: 36, shift2Start: '13:00' },
      escortSettings: result.escortSettings || escortSettings || { requiredPerShift: 4 },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/save-all', async (req, res, next) => {
  try {
    const db = getDb(req);
    const {
      assignments = [],
      bwAssignments = [],
      esAssignments = [],
      kitchenAssignments = [],
      escortAssignments = [],
      kitchenSettings,
      escortSettings,
      start,
      end,
    } = req.body;
    const [peopleRows, postRows] = await Promise.all([
      db.all('SELECT id FROM people WHERE userId = $1', [req.user.id]),
      db.all('SELECT id FROM posts WHERE userId = $1', [req.user.id]),
    ]);
    const personIds = new Set(peopleRows.map(p => p.id));
    const postIds = new Set(postRows.map(p => p.id));
    const sanitizedAssignments = assignments.filter(a => personIds.has(a.personId) && postIds.has(a.postId));
    const sanitizedBw = bwAssignments.filter(a => personIds.has(a.personId));
    const sanitizedKitchen = kitchenAssignments.filter(a => personIds.has(a.personId));
    const sanitizedEscort = escortAssignments.filter(a => personIds.has(a.personId));
    const sanitizedEs = esAssignments.map(es => ({
      groupId: es.groupId,
      personIds: (es.personIds || []).filter(pid => personIds.has(pid)),
    }));
    await persistAllAssignments(
      db,
      sanitizedAssignments,
      sanitizedBw,
      sanitizedEs,
      sanitizedKitchen,
      sanitizedEscort,
      kitchenSettings,
      escortSettings,
      req.user.id,
      start,
      end
    );
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
    const [regular, bw, es, kitchen, escort, kitchenSettingsRows, escortSettingsRows] = await Promise.all([
      db.all('SELECT * FROM assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM bw_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM es_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM kitchen_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM escort_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM kitchen_settings WHERE userId = $1 LIMIT 1', [req.user.id]),
      db.all('SELECT * FROM escort_settings WHERE userId = $1 LIMIT 1', [req.user.id]),
    ]);
    const kitchenSettings = kitchenSettingsRows?.[0]
      ? {
        requiredShift1: Number(kitchenSettingsRows[0].requiredshift1 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
        requiredShift2: Number(kitchenSettingsRows[0].requiredshift2 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
        shift2Start: kitchenSettingsRows[0].shift2start
      }
      : { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' };
    const escortSettings = escortSettingsRows?.[0]
      ? {
        requiredShift1: Number(escortSettingsRows[0].requiredshift1 ?? escortSettingsRows[0].requiredpershift ?? 4),
        requiredShift2: Number(escortSettingsRows[0].requiredshift2 ?? escortSettingsRows[0].requiredpershift ?? 4),
        requiredShift3: Number(escortSettingsRows[0].requiredshift3 ?? escortSettingsRows[0].requiredpershift ?? 4),
        requiredShift4: Number(escortSettingsRows[0].requiredshift4 ?? escortSettingsRows[0].requiredpershift ?? 4),
      }
      : { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 };
    res.json({
      assignments: regular.map(mapAssignment),
      bwAssignments: bw.map(mapBwAssignment),
      esAssignments: mapEsAssignmentRows(es),
      kitchenAssignments: kitchen.map(mapKitchenAssignment),
      escortAssignments: escort.map(mapEscortAssignment),
      kitchenSettings,
      escortSettings,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/clear', async (req, res, next) => {
  try {
    const db = getDb(req);
    const mode = (req.query?.mode || 'all').toString();
    if (mode === 'guards') {
      await Promise.all([clearAssignments(db, req.user.id), clearBwAssignments(db, req.user.id), clearEsAssignments(db, req.user.id)]);
    } else if (mode === 'kitchen') {
      await Promise.all([clearKitchenAssignments(db, req.user.id), clearEscortAssignments(db, req.user.id)]);
    } else {
      await Promise.all([
        clearAssignments(db, req.user.id),
        clearBwAssignments(db, req.user.id),
        clearEsAssignments(db, req.user.id),
        clearKitchenAssignments(db, req.user.id),
        clearEscortAssignments(db, req.user.id),
      ]);
    }
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
    const [assignmentPeriods, bwPeriods, esPeriods, kitchenPeriods, escortPeriods] = await Promise.all([
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
      db.all(`
        SELECT DISTINCT schedule_start::TEXT, schedule_end::TEXT
        FROM archived_kitchen_assignments
        WHERE userId = $1
      `, [req.user.id]),
      db.all(`
        SELECT DISTINCT schedule_start::TEXT, schedule_end::TEXT
        FROM archived_escort_assignments
        WHERE userId = $1
      `, [req.user.id]),
    ]);
    
    // Combine and deduplicate by creating a map
    const periodMap = new Map();
    const allPeriods = [...assignmentPeriods, ...bwPeriods, ...esPeriods, ...kitchenPeriods, ...escortPeriods];
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
    const [regular, bw, es, kitchen, escort, kitchenSettingsRows, escortSettingsRows] = await Promise.all([
      db.all(`SELECT * FROM archived_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3`, [start, end, req.user.id]),
      db.all('SELECT * FROM archived_bw_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_es_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_kitchen_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_escort_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_kitchen_settings WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_escort_settings WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
    ]);
    console.log('Found assignments:', regular.length, 'bw:', bw.length, 'es:', es.length);
    const kitchenSettings = kitchenSettingsRows?.[0]
      ? {
        requiredShift1: Number(kitchenSettingsRows[0].requiredshift1 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
        requiredShift2: Number(kitchenSettingsRows[0].requiredshift2 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
        shift2Start: kitchenSettingsRows[0].shift2start
      }
      : { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' };
    const escortSettings = escortSettingsRows?.[0]
      ? {
        requiredShift1: Number(escortSettingsRows[0].requiredshift1 ?? escortSettingsRows[0].requiredpershift ?? 4),
        requiredShift2: Number(escortSettingsRows[0].requiredshift2 ?? escortSettingsRows[0].requiredpershift ?? 4),
        requiredShift3: Number(escortSettingsRows[0].requiredshift3 ?? escortSettingsRows[0].requiredpershift ?? 4),
        requiredShift4: Number(escortSettingsRows[0].requiredshift4 ?? escortSettingsRows[0].requiredpershift ?? 4),
      }
      : { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 };

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
      kitchenAssignments: kitchen.map(mapKitchenAssignment),
      escortAssignments: escort.map(mapEscortAssignment),
      kitchenSettings,
      escortSettings,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
