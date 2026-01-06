import express from 'express';
import dayjs from 'dayjs';
import { scheduleGenerator } from '../scheduler.js';
import { v4 as uuidv4 } from 'uuid';

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

const mapRasarAssignment = row => ({
  personId: Number(row.personid),
  day: row.day,
  shiftId: row.shiftid,
});

const mapEscort400Assignment = row => ({
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

const parseHHmmToMinutes = (hhmm, fallback = null) => {
  const m = (hhmm || '').toString().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const hh = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return fallback;
  return hh * 60 + mm;
};

const parseShiftLabelMinutes = (shiftLabel) => {
  const m = (shiftLabel || '').match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return null;
  const sh = Number(m[1]);
  const sm = Number(m[2]);
  const eh = Number(m[3]);
  const em = Number(m[4]);
  if ([sh, sm, eh, em].some(x => Number.isNaN(x))) return null;
  const start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) end += 24 * 60;
  return { start, end, minutes: end - start };
};

const existingTables = async (db, names = []) => {
  if (!names.length) return new Set();
  const rows = await db.all(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    [names]
  );
  return new Set(rows.map(r => (r.table_name || r.tableName || '').toString()));
};

const overlapMinutes = (aStartISO, aEndISO, rangeStartISO, rangeEndISO) => {
  const aS = dayjs(aStartISO).second(0).millisecond(0);
  const aE = dayjs(aEndISO).second(0).millisecond(0);
  const rS = dayjs(rangeStartISO).second(0).millisecond(0);
  const rE = dayjs(rangeEndISO).second(0).millisecond(0);
  const start = aS.isAfter(rS) ? aS : rS;
  const end = aE.isBefore(rE) ? aE : rE;
  const diff = end.diff(start, 'minute');
  return diff > 0 ? diff : 0;
};

const dutyHoursFromArchived = async (db, userId, rangeStartISO = null, rangeEndISO = null) => {
  // Returns rows: [{ personId, name, guardsHours, bwHours, kitchenHours, escortHours, rasarHours, escort400Hours, totalHours }]
  // If rangeStartISO/rangeEndISO provided: counts ONLY overlap with that time window.

  const isRange = !!(rangeStartISO && rangeEndISO);
  const startDay = isRange ? dayjs(rangeStartISO).format('YYYY-MM-DD') : null;
  const endDay = isRange ? dayjs(rangeEndISO).format('YYYY-MM-DD') : null;

  const where = isRange
    ? 'userId = $1 AND schedule_end >= $2 AND schedule_start <= $3'
    : 'userId = $1';
  const params = isRange ? [userId, startDay, endDay] : [userId];

  // Some deployments might not have all archive tables yet (e.g. rasar/escort400).
  // Avoid querying missing tables (Postgres logs errors even if the client catches them).
  const tableSet = await existingTables(db, [
    'archived_rasar_assignments',
    'archived_escort400_assignments',
    'archived_kitchen_shifts',
  ]);
  const hasArchivedRasar = tableSet.has('archived_rasar_assignments');
  const hasArchivedEscort400 = tableSet.has('archived_escort400_assignments');
  const hasArchivedKitchenShifts = tableSet.has('archived_kitchen_shifts');

  const [
    peopleRows,
    guardRows,
    bwRows,
    kitchenRows,
    escortRows,
    rasarRows,
    escort400Rows,
    kitchenShiftRows,
  ] = await Promise.all([
    db.all('SELECT id, name FROM people WHERE userId = $1', [userId]),
    db.all(`SELECT schedule_start::TEXT, schedule_end::TEXT, personId, shiftLabel, startISO, endISO, day FROM archived_assignments WHERE ${where}`, params),
    db.all(`SELECT schedule_start::TEXT, schedule_end::TEXT, personId, slotId, day FROM archived_bw_assignments WHERE ${where}`, params),
    db.all(`SELECT schedule_start::TEXT, schedule_end::TEXT, personId, shiftId, day FROM archived_kitchen_assignments WHERE ${where}`, params),
    db.all(`SELECT schedule_start::TEXT, schedule_end::TEXT, personId, shiftId, day FROM archived_escort_assignments WHERE ${where}`, params),
    hasArchivedRasar
      ? db.all(`SELECT schedule_start::TEXT, schedule_end::TEXT, personId, shiftId, day FROM archived_rasar_assignments WHERE ${where}`, params)
      : Promise.resolve([]),
    hasArchivedEscort400
      ? db.all(`SELECT schedule_start::TEXT, schedule_end::TEXT, personId, shiftId, day FROM archived_escort400_assignments WHERE ${where}`, params)
      : Promise.resolve([]),
    hasArchivedKitchenShifts
      ? db.all(`SELECT schedule_start::TEXT, schedule_end::TEXT, shiftId, startHHmm, endHHmm FROM archived_kitchen_shifts WHERE ${where} ORDER BY idx ASC`, params)
      : Promise.resolve([]),
  ]);

  const init = () => ({
    guardsHours: 0,
    bwHours: 0,
    kitchenHours: 0,
    escortHours: 0,
    rasarHours: 0,
    escort400Hours: 0,
    totalHours: 0,
  });

  const out = new Map();
  for (const p of peopleRows) out.set(Number(p.id), init());

  const add = (personId, key, hours) => {
    const pid = Number(personId);
    if (!out.has(pid)) out.set(pid, init());
    out.get(pid)[key] += hours;
  };

  const inRangeHours = (startISO, endISO) => {
    const s = dayjs(startISO);
    const e = dayjs(endISO);
    if (!e.isAfter(s)) return 0;
    if (!isRange) return e.diff(s, 'minute') / 60;
    return overlapMinutes(startISO, endISO, rangeStartISO, rangeEndISO) / 60;
  };

  const makeDayRange = (day, startHHmm, endHHmm) => {
    const s = dayjs(`${day}T${startHHmm}:00`);
    let e = dayjs(`${day}T${endHHmm}:00`);
    if (!e.isAfter(s)) e = e.add(1, 'day');
    return { start: s.toISOString(), end: e.toISOString() };
  };

  // Guards: prefer start/end ISO if present, else parse shiftLabel on that day.
  for (const r of guardRows) {
    const pid = Number(r.personid ?? r.personId);
    const startISO = r.startiso ?? r.startISO;
    const endISO = r.endiso ?? r.endISO;
    if (startISO && endISO) {
      const h = inRangeHours(startISO, endISO);
      if (h > 0) add(pid, 'guardsHours', h);
      continue;
    }
    const parsed = parseShiftLabelMinutes(r.shiftlabel ?? r.shiftLabel);
    const day = (r.day || '').toString();
    if (!parsed || !day) continue;
    const startHH = `${String(Math.floor(parsed.start / 60)).padStart(2, '0')}:${String(parsed.start % 60).padStart(2, '0')}`;
    const endHHm = parsed.end % (24 * 60);
    const endHH = `${String(Math.floor(endHHm / 60)).padStart(2, '0')}:${String(endHHm % 60).padStart(2, '0')}`;
    const rng = makeDayRange(day, startHH, endHH);
    const h = inRangeHours(rng.start, rng.end);
    if (h > 0) add(pid, 'guardsHours', h);
  }

  // BW: fixed slot definitions.
  const BW_SLOT_DEFS = [
    { id: 'bw_morning', start: '08:30', end: '11:30' }, // 3h
    { id: 'bw_afternoon', start: '13:30', end: '17:30' }, // 4h
    { id: 'bw_evening', start: '18:30', end: '20:00' }, // 1.5h
  ];
  const bwSlotById = new Map(BW_SLOT_DEFS.map(d => [d.id, d]));
  for (const r of bwRows) {
    const pid = Number(r.personid ?? r.personId);
    const slotId = (r.slotid ?? r.slotId)?.toString();
    const day = (r.day || '').toString();
    const def = bwSlotById.get(slotId);
    if (!day || !def) continue;
    const rng = makeDayRange(day, def.start, def.end);
    const h = inRangeHours(rng.start, rng.end);
    if (h > 0) add(pid, 'bwHours', h);
  }

  // Kitchen: use archived_kitchen_shifts for durations.
  const kitchenShiftByPeriodAndId = new Map(); // `${schedule_start}|${schedule_end}|${shiftId}` -> {start,end}
  for (const s of kitchenShiftRows) {
    const scheduleStart = (s.schedule_start ?? s.scheduleStart ?? '').toString();
    const scheduleEnd = (s.schedule_end ?? s.scheduleEnd ?? '').toString();
    const id = (s.shiftid ?? s.shiftId)?.toString();
    const startHHmm = (s.starthhmm ?? s.startHHmm)?.toString();
    const endHHmm = (s.endhhmm ?? s.endHHmm)?.toString();
    if (!scheduleStart || !scheduleEnd || !id || !startHHmm || !endHHmm) continue;
    kitchenShiftByPeriodAndId.set(`${scheduleStart}|${scheduleEnd}|${id}`, { startHHmm, endHHmm });
  }
  // Fallback if shift definition missing (older archives): assume 06:00-21:00 = 15h.
  const kitchenFallback = { startHHmm: '06:00', endHHmm: '21:00' };
  for (const r of kitchenRows) {
    const pid = Number(r.personid ?? r.personId);
    const shiftId = (r.shiftid ?? r.shiftId)?.toString();
    const scheduleStart = (r.schedule_start ?? r.scheduleStart ?? '').toString();
    const scheduleEnd = (r.schedule_end ?? r.scheduleEnd ?? '').toString();
    const day = (r.day || '').toString();
    if (!day) continue;
    const def = kitchenShiftByPeriodAndId.get(`${scheduleStart}|${scheduleEnd}|${shiftId}`) || kitchenFallback;
    const rng = makeDayRange(day, def.startHHmm, def.endHHmm);
    const h = inRangeHours(rng.start, rng.end);
    if (h > 0) add(pid, 'kitchenHours', h);
  }

  // Escort: fixed shifts
  const escortRangesByShiftId = new Map([
    ['escort_1', { start: '07:00', end: '10:30' }],
    ['escort_2', { start: '10:30', end: '14:00' }],
    ['escort_3', { start: '14:00', end: '17:00' }],
    ['escort_4', { start: '17:00', end: '19:00' }],
  ]);
  for (const r of escortRows) {
    const pid = Number(r.personid ?? r.personId);
    const shiftId = (r.shiftid ?? r.shiftId)?.toString();
    const day = (r.day || '').toString();
    const def = escortRangesByShiftId.get(shiftId);
    if (!day || !def) continue;
    const rng = makeDayRange(day, def.start, def.end);
    const h = inRangeHours(rng.start, rng.end);
    if (h > 0) add(pid, 'escortHours', h);
  }

  // Rasar: fixed shifts
  const rasarRangesByShiftId = new Map([
    ['rasar_1', { start: '08:30', end: '11:30' }],
    ['rasar_2', { start: '13:30', end: '17:30' }],
    ['rasar_3', { start: '19:30', end: '20:30' }],
  ]);
  for (const r of rasarRows || []) {
    const pid = Number(r.personid ?? r.personId);
    const shiftId = (r.shiftid ?? r.shiftId)?.toString();
    const day = (r.day || '').toString();
    const def = rasarRangesByShiftId.get(shiftId);
    if (!day || !def) continue;
    const rng = makeDayRange(day, def.start, def.end);
    const h = inRangeHours(rng.start, rng.end);
    if (h > 0) add(pid, 'rasarHours', h);
  }

  // Escort400: fixed shifts
  const escort400RangesByShiftId = new Map([
    ['escort400_1', { start: '08:00', end: '12:30' }],
    ['escort400_2', { start: '12:30', end: '17:00' }],
  ]);
  for (const r of escort400Rows || []) {
    const pid = Number(r.personid ?? r.personId);
    const shiftId = (r.shiftid ?? r.shiftId)?.toString();
    const day = (r.day || '').toString();
    const def = escort400RangesByShiftId.get(shiftId);
    if (!day || !def) continue;
    const rng = makeDayRange(day, def.start, def.end);
    const h = inRangeHours(rng.start, rng.end);
    if (h > 0) add(pid, 'escort400Hours', h);
  }

  // Totals
  for (const [pid, v] of out.entries()) {
    v.totalHours =
      v.guardsHours + v.bwHours + v.kitchenHours + v.escortHours + v.rasarHours + v.escort400Hours;
    out.set(pid, v);
  }

  // Attach names
  const nameById = new Map(peopleRows.map(p => [Number(p.id), p.name]));
  const rows = Array.from(out.entries()).map(([personId, v]) => ({
    personId,
    name: nameById.get(personId) || String(personId),
    ...v,
  }));

  return rows;
};

const respondError = (res, message = 'not enough manpower', missingCount = null) =>
  res.json({
    assignments: [],
    bwAssignments: [],
    esAssignments: [],
    kitchenAssignments: [],
    escortAssignments: [],
    rasarAssignments: [],
    escort400Assignments: [],
    kitchenSettings: { shifts: [{ id: 'default', start: '06:00', end: '21:00', required: 36 }] },
    escortSettings: { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 },
    error: message,
    missingCount,
  });

const pad2 = n => String(n).padStart(2, '0');
const clampHHmm = (value, fallback = '13:00') => {
  const str = (value || fallback || '').toString();
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  let h = Number(m[1]);
  let mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return fallback;
  h = Math.min(23, Math.max(0, h));
  mm = Math.min(59, Math.max(0, mm));
  return `${pad2(h)}:${pad2(mm)}`;
};

const hhmmToMinutes = hhmm => {
  const m = (hhmm || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
};

const minutesToHHmm = mins => {
  const v = Math.min(24 * 60 - 1, Math.max(0, Number(mins) || 0));
  return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
};

const normalizeKitchenSettings = (input) => {
  // New format: { shifts: [{id,start,end,required}, ...] }
  const rawShifts = Array.isArray(input?.shifts) ? input.shifts : null;
  if (rawShifts && rawShifts.length > 0) {
    const shifts = rawShifts.map((s, idx) => ({
      id: (s?.id || uuidv4()).toString(),
      start: clampHHmm(s?.start, idx === 0 ? '06:00' : '06:00'),
      end: clampHHmm(s?.end, idx === rawShifts.length - 1 ? '21:00' : '21:00'),
      required: Math.max(0, Number(s?.required ?? 36) || 0),
    }));

    // Validate contiguous 06:00..21:00 partition (minute precision)
    shifts.sort((a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start));
    if (shifts.length < 1) throw new Error('Kitchen shifts: empty');
    if (shifts[0].start !== '06:00') throw new Error('Kitchen shifts must start at 06:00');
    if (shifts[shifts.length - 1].end !== '21:00') throw new Error('Kitchen shifts must end at 21:00');
    for (let i = 0; i < shifts.length; i += 1) {
      const s = shifts[i];
      const startM = hhmmToMinutes(s.start);
      const endM = hhmmToMinutes(s.end);
      if (!(endM > startM)) throw new Error('Kitchen shifts must have positive duration');
      if (startM < 6 * 60 || endM > 21 * 60) throw new Error('Kitchen shifts must be within 06:00–21:00');
      if (i > 0) {
        const prev = shifts[i - 1];
        if (prev.end !== s.start) throw new Error('Kitchen shifts must be contiguous (no gaps/overlaps)');
      }
    }
    return { shifts };
  }

  // Legacy format fallback: { shift2Start, requiredShift1, requiredShift2, requiredPerShift }
  const requiredPerShift = Number(input?.requiredPerShift ?? 36);
  const req1 = Number(input?.requiredShift1 ?? requiredPerShift ?? 36);
  const req2 = Number(input?.requiredShift2 ?? requiredPerShift ?? 36);
  const rawShift2 = clampHHmm(input?.shift2Start ?? '13:00', '13:00');
  const min = 6 * 60;
  const max = 20 * 60 + 59;
  const s2 = Math.min(max, Math.max(min, hhmmToMinutes(rawShift2)));
  const shift2Start = minutesToHHmm(s2);
  return {
    shifts: [
      { id: 'kitchen_1', start: '06:00', end: shift2Start, required: Math.max(0, req1) },
      { id: 'kitchen_2', start: shift2Start, end: '21:00', required: Math.max(0, req2) },
    ].filter(s => hhmmToMinutes(s.end) > hhmmToMinutes(s.start)),
  };
};

const shuffle = (arr = []) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const sanitizeKitchenByShiftIds = (arr = [], shiftIdSet) =>
  (arr || []).filter(a => shiftIdSet.has((a?.shiftId || '').toString()));

const clearAssignments = (db, userId) => db.run('DELETE FROM assignments WHERE userId = $1', [userId]);
const clearBwAssignments = (db, userId) => db.run('DELETE FROM bw_assignments WHERE userId = $1', [userId]);
const clearEsAssignments = (db, userId) => db.run('DELETE FROM es_assignments WHERE userId = $1', [userId]);
const clearKitchenAssignments = (db, userId) => db.run('DELETE FROM kitchen_assignments WHERE userId = $1', [userId]);
const clearEscortAssignments = (db, userId) => db.run('DELETE FROM escort_assignments WHERE userId = $1', [userId]);
const clearRasarAssignments = (db, userId) => db.run('DELETE FROM rasar_assignments WHERE userId = $1', [userId]);
const clearEscort400Assignments = (db, userId) => db.run('DELETE FROM escort400_assignments WHERE userId = $1', [userId]);

const upsertKitchenSettings = async (db, userId, kitchenSettings) => {
  const normalized = normalizeKitchenSettings(kitchenSettings);
  const shifts = normalized.shifts || [];
  await db.run('DELETE FROM kitchen_shifts WHERE userId = $1', [userId]);
  for (let idx = 0; idx < shifts.length; idx += 1) {
    const s = shifts[idx];
    await db.run(
      'INSERT INTO kitchen_shifts (shiftId, idx, startHHmm, endHHmm, required, userId) VALUES ($1, $2, $3, $4, $5, $6)',
      [s.id, idx, s.start, s.end, Math.max(0, Number(s.required ?? 36)), userId]
    );
  }
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

const persistRasarAssignments = async (db, rasarAssignments = [], userId) => {
  for (const { personId, day, shiftId } of rasarAssignments) {
    await db.run(
      'INSERT INTO rasar_assignments (personId, day, shiftId, userId) VALUES ($1, $2, $3, $4)',
      [personId, day, shiftId, userId]
    );
  }
};

const persistEscort400Assignments = async (db, escort400Assignments = [], userId) => {
  for (const { personId, day, shiftId } of escort400Assignments) {
    await db.run(
      'INSERT INTO escort400_assignments (personId, day, shiftId, userId) VALUES ($1, $2, $3, $4)',
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

  // Use local time (not UTC) since rangeStart/rangeEnd are parsed as local time
  const dayDate = new Date(day + 'T00:00:00');
  const slotStart = new Date(dayDate);
  slotStart.setHours(slot.startHour, slot.startMinute, 0, 0);

  const slotEnd = new Date(dayDate);
  slotEnd.setHours(slot.endHour, slot.endMinute, 0, 0);

  // Handle slots that might span midnight
  if (slotEnd <= slotStart) {
    slotEnd.setDate(slotEnd.getDate() + 1);
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
  rasarAssignments = [],
  escort400Assignments = [],
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
  await db.run('DELETE FROM archived_kitchen_shifts WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);
  await db.run('DELETE FROM archived_kitchen_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);
  await db.run('DELETE FROM archived_escort_settings WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);
  await db.run('DELETE FROM archived_escort_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]);
  // Optional tables (may not exist in older deployments)
  try { await db.run('DELETE FROM archived_rasar_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]); } catch {}
  try { await db.run('DELETE FROM archived_escort400_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [scheduleStart, scheduleEnd, userId]); } catch {}

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

  const ks = normalizeKitchenSettings(kitchenSettings);
  // Archive the shift list for this period (primary source of truth)
  for (let idx = 0; idx < (ks.shifts || []).length; idx += 1) {
    const s = ks.shifts[idx];
    await db.run(
      'INSERT INTO archived_kitchen_shifts (schedule_start, schedule_end, shiftId, idx, startHHmm, endHHmm, required, userId) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [scheduleStart, scheduleEnd, s.id, idx, s.start, s.end, Math.max(0, Number(s.required ?? 36)), userId]
    );
  }
  // Keep legacy archived_kitchen_settings populated for backward compatibility (best-effort).
  // If we have exactly 2 shifts, map them back to the legacy schema; otherwise store a single requiredPerShift.
  if ((ks.shifts || []).length === 2) {
    const [s1, s2] = ks.shifts;
    await db.run(
      'INSERT INTO archived_kitchen_settings (schedule_start, schedule_end, requiredPerShift, requiredShift1, requiredShift2, shift2Start, userId) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [scheduleStart, scheduleEnd, 36, Number(s1.required ?? 36), Number(s2.required ?? 36), s2.start, userId]
    );
  } else {
    const req = Number((ks.shifts || [])[0]?.required ?? 36);
    await db.run(
      'INSERT INTO archived_kitchen_settings (schedule_start, schedule_end, requiredPerShift, requiredShift1, requiredShift2, shift2Start, userId) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [scheduleStart, scheduleEnd, req, req, req, '13:00', userId]
    );
  }

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

  // Archive rasar + escort400 too (if tables exist)
  for (const r of rasarAssignments || []) {
    try {
      await db.run(
        'INSERT INTO archived_rasar_assignments (schedule_start, schedule_end, personId, day, shiftId, userId) VALUES ($1, $2, $3, $4, $5, $6)',
        [scheduleStart, scheduleEnd, Number(r.personId), r.day, r.shiftId, userId]
      );
    } catch {}
  }
  for (const a of escort400Assignments || []) {
    try {
      await db.run(
        'INSERT INTO archived_escort400_assignments (schedule_start, schedule_end, personId, day, shiftId, userId) VALUES ($1, $2, $3, $4, $5, $6)',
        [scheduleStart, scheduleEnd, Number(a.personId), a.day, a.shiftId, userId]
      );
    } catch {}
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
  rasarAssignments = [],
  escort400Assignments = [],
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
    clearRasarAssignments(db, userId),
    clearEscort400Assignments(db, userId),
  ]);
  await persistAssignments(db, assignments, userId);
  await persistBwAssignments(db, bwAssignments, userId);
  await persistEsAssignments(db, esAssignments, userId);
  await persistKitchenAssignments(db, kitchenAssignments, userId);
  await persistEscortAssignments(db, escortAssignments, userId);
  await persistRasarAssignments(db, rasarAssignments, userId);
  await persistEscort400Assignments(db, escort400Assignments, userId);
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
    rasarAssignments,
    escort400Assignments,
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

const persistRasarOnly = async (db, rasarAssignments = [], userId) => {
  await clearRasarAssignments(db, userId);
  await persistRasarAssignments(db, rasarAssignments, userId);
};

const persistEscort400Only = async (db, escort400Assignments = [], userId) => {
  await clearEscort400Assignments(db, userId);
  await persistEscort400Assignments(db, escort400Assignments, userId);
};

const fetchKitchenEscortSnapshot = async (db, userId) => {
  const [kitchen, escort, kitchenShiftRows, kitchenSettingsRows, escortSettingsRows] = await Promise.all([
    db.all('SELECT * FROM kitchen_assignments WHERE userId = $1', [userId]),
    db.all('SELECT * FROM escort_assignments WHERE userId = $1', [userId]),
    db.all('SELECT shiftId, idx, startHHmm, endHHmm, required FROM kitchen_shifts WHERE userId = $1 ORDER BY idx ASC', [userId]),
    db.all('SELECT * FROM kitchen_settings WHERE userId = $1 LIMIT 1', [userId]),
    db.all('SELECT * FROM escort_settings WHERE userId = $1 LIMIT 1', [userId]),
  ]);

  let kitchenSettings = null;
  if (kitchenShiftRows && kitchenShiftRows.length) {
    kitchenSettings = {
      shifts: kitchenShiftRows.map(r => ({
        id: r.shiftid || r.shiftId,
        start: r.starthhmm || r.startHHmm,
        end: r.endhhmm || r.endHHmm,
        required: Number(r.required ?? 36),
      })),
    };
  } else {
    // Backward-compat fallback: synthesize from legacy kitchen_settings.
    const legacy = kitchenSettingsRows?.[0]
      ? {
        requiredShift1: Number(kitchenSettingsRows[0].requiredshift1 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
        requiredShift2: Number(kitchenSettingsRows[0].requiredshift2 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
        shift2Start: kitchenSettingsRows[0].shift2start
      }
      : { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' };
    kitchenSettings = normalizeKitchenSettings(legacy);
  }
  kitchenSettings = normalizeKitchenSettings(kitchenSettings);

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

const fetchRasarSnapshot = async (db, userId) => {
  const rows = await db.all('SELECT * FROM rasar_assignments WHERE userId = $1', [userId]);
  return { rasarAssignments: rows.map(mapRasarAssignment) };
};

const fetchEscort400Snapshot = async (db, userId) => {
  const rows = await db.all('SELECT * FROM escort400_assignments WHERE userId = $1', [userId]);
  return { escort400Assignments: rows.map(mapEscort400Assignment) };
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
      existingRasarAssignments = [],
      existingEscort400Assignments = [],
      kitchenSettings,
      escortSettings,
      constraints = [],
    } = req.body;

    let normalizedKitchenSettings = null;
    try {
      normalizedKitchenSettings = normalizeKitchenSettings(kitchenSettings);
    } catch (e) {
      return respondError(res, e?.message || 'Invalid kitchen settings', null);
    }
    const kitchenShiftIdSet = new Set((normalizedKitchenSettings.shifts || []).map(s => s.id));

    const [peopleRows, postRows] = await Promise.all([
      db.all('SELECT * FROM people WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM posts WHERE userId = $1', [req.user.id]),
    ]);

    const personIds = new Set(peopleRows.map(p => p.id));
    const postIds = new Set(postRows.map(p => p.id));
    // For rasar generation we only need guard assignment PERSON+TIME for overlap prevention.
    // Do NOT drop guard assignments just because their postId doesn't exist (or posts aren't loaded).
    const sanitizeAssignments = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeBw = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeKitchen = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEscort = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeRasar = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEscort400 = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEs = arr =>
      (arr || []).map(es => ({
        groupId: es.groupId,
        personIds: (es.personIds || []).filter(pid => personIds.has(pid)),
      }));

    const sanitizedEs = sanitizeEs(esAssignments);
    const sanitizedAssignments = sanitizeAssignments(existingAssignments);
    const sanitizedBw = sanitizeBw(existingBwAssignments);
    const sanitizedKitchen = sanitizeKitchenByShiftIds(sanitizeKitchen(existingKitchenAssignments), kitchenShiftIdSet);
    const sanitizedEscort = sanitizeEscort(existingEscortAssignments);
    let sanitizedRasar = sanitizeRasar(existingRasarAssignments);
    let sanitizedEscort400 = sanitizeEscort400(existingEscort400Assignments);
    // Robustness: if client didn't send rasar/escort400 (or sent empty), fall back to DB truth.
    if ((sanitizedRasar?.length || 0) === 0) {
      const rows = await db.all('SELECT personId, day, shiftId FROM rasar_assignments WHERE userId = $1', [req.user.id]);
      sanitizedRasar = sanitizeRasar(rows.map(r => ({ personId: Number(r.personid), day: r.day, shiftId: r.shiftid })));
    }
    if ((sanitizedEscort400?.length || 0) === 0) {
      const rows = await db.all('SELECT personId, day, shiftId FROM escort400_assignments WHERE userId = $1', [req.user.id]);
      sanitizedEscort400 = sanitizeEscort400(rows.map(r => ({ personId: Number(r.personid), day: r.day, shiftId: r.shiftid })));
    }

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
      sanitizedKitchen,
      sanitizedEscort,
      normalizedKitchenSettings,
      escortSettings,
      constraints,
      { existingRasarAssignments: sanitizedRasar, existingEscort400Assignments: sanitizedEscort400, rasarStartISO: startISO, rasarEndISO: endISO }
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
      result.rasarAssignments || [],
      result.escort400Assignments || [],
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
      rasarAssignments: result.rasarAssignments || [],
      escort400Assignments: result.escort400Assignments || [],
      kitchenSettings: result.kitchenSettings || normalizedKitchenSettings || { shifts: [{ id: 'default', start: '06:00', end: '21:00', required: 36 }] },
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
      existingRasarAssignments = [],
      existingEscort400Assignments = [],
      kitchenSettings,
      escortSettings,
      constraints = [],
    } = req.body;

    let normalizedKitchenSettings = null;
    try {
      normalizedKitchenSettings = normalizeKitchenSettings(kitchenSettings);
    } catch (e) {
      return respondError(res, e?.message || 'Invalid kitchen settings', null);
    }
    const kitchenShiftIdSet = new Set((normalizedKitchenSettings.shifts || []).map(s => s.id));

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
    const sanitizeKitchen = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEscort = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeRasar = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEscort400 = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEs = arr =>
      (arr || []).map(es => ({
        groupId: es.groupId,
        personIds: (es.personIds || []).filter(pid => personIds.has(pid)),
      }));

    const sanitizedEs = sanitizeEs(esAssignments);
    const sanitizedAssignments = sanitizeAssignments(existingAssignments);
    const sanitizedBw = sanitizeBw(existingBwAssignments);
    const sanitizedKitchen = sanitizeKitchenByShiftIds(sanitizeKitchen(existingKitchenAssignments), kitchenShiftIdSet);
    const sanitizedEscort = sanitizeEscort(existingEscortAssignments);
    let sanitizedRasar = sanitizeRasar(existingRasarAssignments);
    let sanitizedEscort400 = sanitizeEscort400(existingEscort400Assignments);
    // Robustness: if client didn't send rasar/escort400 (or sent empty), fall back to DB truth.
    if ((sanitizedRasar?.length || 0) === 0) {
      const rows = await db.all('SELECT personId, day, shiftId FROM rasar_assignments WHERE userId = $1', [req.user.id]);
      sanitizedRasar = sanitizeRasar(rows.map(r => ({ personId: Number(r.personid), day: r.day, shiftId: r.shiftid })));
    }
    if ((sanitizedEscort400?.length || 0) === 0) {
      const rows = await db.all('SELECT personId, day, shiftId FROM escort400_assignments WHERE userId = $1', [req.user.id]);
      sanitizedEscort400 = sanitizeEscort400(rows.map(r => ({ personId: Number(r.personid), day: r.day, shiftId: r.shiftid })));
    }

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
      sanitizedKitchen,
      sanitizedEscort,
      normalizedKitchenSettings,
      escortSettings,
      constraints,
      { mode: 'guards', existingRasarAssignments: sanitizedRasar, existingEscort400Assignments: sanitizedEscort400, rasarStartISO: startISO, rasarEndISO: endISO }
    );

    if (result.error) return respondError(res, result.error, result.missingCount ?? null);

    // Final safety: never persist a guards schedule that overlaps existing duties (kitchen/escort/rasar/400/BW).
    // If we can't satisfy constraints without overlaps, treat it as "not enough manpower".
    const overlapsIso = (aStart, aEnd, bStart, bEnd) => {
      const aS = dayjs(aStart);
      const aE = dayjs(aEnd);
      const bS = dayjs(bStart);
      const bE = dayjs(bEnd);
      if (
        (aE.isSame(bS, 'minute') || aE.isBefore(bS, 'minute')) ||
        (bE.isSame(aS, 'minute') || bE.isBefore(aS, 'minute'))
      ) return false;
      return aS.isBefore(bE) && bS.isBefore(aE);
    };
    const parseGuardRange = (a) => {
      if (a.start && a.end) return { start: a.start, end: a.end };
      const m = (a.shiftLabel || '').match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
      if (!m || !a.day) return null;
      const start = dayjs(`${a.day}T${m[1]}:${m[2]}:00`);
      let end = dayjs(`${a.day}T${m[3]}:${m[4]}:00`);
      if (!end.isAfter(start)) end = end.add(1, 'day');
      return { start: start.toISOString(), end: end.toISOString() };
    };

    const intervalsByPerson = new Map(); // pid -> [{start,end}]
    const addInterval = (pid, range) => {
      if (!range) return;
      const arr = intervalsByPerson.get(pid) || [];
      arr.push(range);
      intervalsByPerson.set(pid, arr);
    };

    // BW (build from day+slotId; start/end may be missing in payload)
    const BW_SLOT_DEFS = [
      { id: 'bw_morning', start: '08:30', end: '11:30' },
      { id: 'bw_afternoon', start: '13:30', end: '17:30' },
      { id: 'bw_evening', start: '18:30', end: '20:00' },
    ];
    const buildBwRange = (day, slotId) => {
      const def = BW_SLOT_DEFS.find(s => s.id === slotId);
      if (!def || !day) return null;
      const start = dayjs(`${day}T${def.start}:00`);
      let end = dayjs(`${day}T${def.end}:00`);
      if (!end.isAfter(start)) end = end.add(1, 'day');
      return { start: start.toISOString(), end: end.toISOString() };
    };
    for (const bw of sanitizedBw || []) addInterval(Number(bw.personId), bw.start && bw.end ? { start: bw.start, end: bw.end } : buildBwRange(bw.day, bw.slotId));

    // Kitchen
    const kitchenShiftById = new Map((normalizedKitchenSettings.shifts || []).map(s => [s.id, s]));
    for (const k of sanitizedKitchen || []) {
      const def = kitchenShiftById.get(k.shiftId);
      if (!def) continue;
      addInterval(Number(k.personId), {
        start: dayjs(`${k.day}T${def.start}:00`).toISOString(),
        end: dayjs(`${k.day}T${def.end}:00`).toISOString(),
      });
    }

    // Escort
    const escortDefs = {
      escort_1: { start: '07:00', end: '10:30' },
      escort_2: { start: '10:30', end: '14:00' },
      escort_3: { start: '14:00', end: '17:00' },
      escort_4: { start: '17:00', end: '19:00' },
    };
    for (const e of sanitizedEscort || []) {
      const def = escortDefs[e.shiftId];
      if (!def) continue;
      addInterval(Number(e.personId), {
        start: dayjs(`${e.day}T${def.start}:00`).toISOString(),
        end: dayjs(`${e.day}T${def.end}:00`).toISOString(),
      });
    }

    // Rasar
    const rasarDefs = {
      rasar_1: { start: '08:30', end: '11:30' },
      rasar_2: { start: '13:30', end: '17:30' },
      rasar_3: { start: '19:30', end: '20:30' },
    };
    for (const r of sanitizedRasar || []) {
      const def = rasarDefs[r.shiftId];
      if (!def) continue;
      addInterval(Number(r.personId), {
        start: dayjs(`${r.day}T${def.start}:00`).toISOString(),
        end: dayjs(`${r.day}T${def.end}:00`).toISOString(),
      });
    }

    // Escort400
    const escort400Defs = {
      escort400_1: { start: '08:00', end: '12:30' },
      escort400_2: { start: '12:30', end: '17:00' },
    };
    for (const e400 of sanitizedEscort400 || []) {
      const def = escort400Defs[e400.shiftId];
      if (!def) continue;
      addInterval(Number(e400.personId), {
        start: dayjs(`${e400.day}T${def.start}:00`).toISOString(),
        end: dayjs(`${e400.day}T${def.end}:00`).toISOString(),
      });
    }

    const overlapViolations = [];
    for (const a of result.assignments || []) {
      const pid = Number(a.personId);
      const range = parseGuardRange(a);
      if (!pid || !range) continue;
      const others = intervalsByPerson.get(pid) || [];
      for (const o of others) {
        if (overlapsIso(range.start, range.end, o.start, o.end)) {
          overlapViolations.push(pid);
          break;
        }
      }
    }
    if (overlapViolations.length) {
      return respondError(res, 'not enough manpower', 1);
    }

    await persistGuardsOnly(db, result.assignments, result.bwAssignments, sanitizedEs, req.user.id);

    const [kitchenSnap, rasarSnap, escort400Snap] = await Promise.all([
      fetchKitchenEscortSnapshot(db, req.user.id),
      fetchRasarSnapshot(db, req.user.id),
      fetchEscort400Snapshot(db, req.user.id),
    ]);
    res.json({
      assignments: result.assignments,
      bwAssignments: result.bwAssignments,
      esAssignments: sanitizedEs,
      ...kitchenSnap,
      ...rasarSnap,
      ...escort400Snap,
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
      kitchenDay,
      esAssignments = [],
      existingAssignments = [],
      existingBwAssignments = [],
      existingKitchenAssignments = [],
      existingEscortAssignments = [],
      existingRasarAssignments = [],
      existingEscort400Assignments = [],
      kitchenSettings,
      escortSettings,
      constraints = [],
    } = req.body;

    let normalizedKitchenSettings = null;
    try {
      normalizedKitchenSettings = normalizeKitchenSettings(kitchenSettings);
    } catch (e) {
      return respondError(res, e?.message || 'Invalid kitchen settings', null);
    }
    const kitchenShiftIdSet = new Set((normalizedKitchenSettings.shifts || []).map(s => s.id));

    // kitchenDay is local date "YYYY-MM-DD". Derive ISO range 06:00–21:00.
    const effectiveKitchenStartISO =
      (kitchenDay ? `${kitchenDay}T06:00:00` : kitchenStartISO);
    const effectiveKitchenEndISO =
      (kitchenDay ? `${kitchenDay}T21:00:00` : kitchenEndISO);
    if (!effectiveKitchenStartISO || !effectiveKitchenEndISO) {
      return res.status(400).json({ error: 'kitchenDay or kitchenStartISO/kitchenEndISO required' });
    }

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
    const sanitizeKitchen = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEscort = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeRasar = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEscort400 = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEs = arr =>
      (arr || []).map(es => ({
        groupId: es.groupId,
        personIds: (es.personIds || []).filter(pid => personIds.has(pid)),
      }));

    const sanitizedEs = sanitizeEs(esAssignments);
    const sanitizedAssignments = sanitizeAssignments(existingAssignments);
    const sanitizedBw = sanitizeBw(existingBwAssignments);
    const sanitizedKitchen = sanitizeKitchenByShiftIds(sanitizeKitchen(existingKitchenAssignments), kitchenShiftIdSet);
    const sanitizedEscort = sanitizeEscort(existingEscortAssignments);
    let sanitizedRasar = sanitizeRasar(existingRasarAssignments);
    let sanitizedEscort400 = sanitizeEscort400(existingEscort400Assignments);

    // Robustness: if client didn't send rasar/escort400 (or sent empty), fall back to DB truth.
    if ((sanitizedRasar?.length || 0) === 0) {
      const rows = await db.all('SELECT personId, day, shiftId FROM rasar_assignments WHERE userId = $1', [req.user.id]);
      sanitizedRasar = sanitizeRasar(rows.map(r => ({ personId: Number(r.personid), day: r.day, shiftId: r.shiftid })));
    }
    if ((sanitizedEscort400?.length || 0) === 0) {
      const rows = await db.all('SELECT personId, day, shiftId FROM escort400_assignments WHERE userId = $1', [req.user.id]);
      sanitizedEscort400 = sanitizeEscort400(rows.map(r => ({ personId: Number(r.personid), day: r.day, shiftId: r.shiftid })));
    }

    const shuffledPeople = shuffle(peopleRows).map(mapPerson);

    const result = scheduleGenerator(
      shuffledPeople,
      postRows.map(mapPost),
      startISO,
      endISO,
      [], // no guard overrides needed for kitchen generation
      sanitizedEs,
      sanitizedAssignments,
      sanitizedBw,
      sanitizedKitchen,
      sanitizedEscort,
      normalizedKitchenSettings,
      escortSettings,
      constraints,
      {
        mode: 'kitchen',
        kitchenStartISO: effectiveKitchenStartISO,
        kitchenEndISO: effectiveKitchenEndISO,
        existingRasarAssignments: sanitizedRasar,
        existingEscort400Assignments: sanitizedEscort400,
        rasarStartISO: startISO,
        rasarEndISO: endISO
      }
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

    const [guardsSnap, rasarSnap, escort400Snap] = await Promise.all([
      fetchGuardsSnapshot(db, req.user.id),
      fetchRasarSnapshot(db, req.user.id),
      fetchEscort400Snapshot(db, req.user.id),
    ]);
    res.json({
      ...guardsSnap,
      esAssignments: guardsSnap.esAssignments, // keep server truth
      kitchenAssignments: result.kitchenAssignments || [],
      escortAssignments: result.escortAssignments || [],
      ...rasarSnap,
      ...escort400Snap,
      kitchenSettings: result.kitchenSettings || normalizedKitchenSettings || { shifts: [{ id: 'default', start: '06:00', end: '21:00', required: 36 }] },
      escortSettings: result.escortSettings || escortSettings || { requiredPerShift: 4 },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/generate-rasar', async (req, res, next) => {
  try {
    const db = getDb(req);
    const {
      startISO,
      endISO,
      rasarStartISO,
      rasarEndISO,
      rasarOverrides = [],
      escort400Overrides = [],
      esAssignments = [],
      existingAssignments = [],
      existingBwAssignments = [],
      existingKitchenAssignments = [],
      existingEscortAssignments = [],
      existingRasarAssignments = [],
      existingEscort400Assignments = [],
      kitchenSettings,
      escortSettings,
      constraints = [],
    } = req.body;

    const effectiveStartISO = startISO ?? rasarStartISO;
    const effectiveEndISO = endISO ?? rasarEndISO;
    if (!effectiveStartISO || !effectiveEndISO) {
      return res.status(400).json({ error: 'startISO and endISO required' });
    }

    let normalizedKitchenSettings = null;
    try {
      // If the client didn't send kitchenSettings (or sent legacy/empty), fall back to DB kitchen_shifts (source of truth).
      const kitchenShiftRows = await db.all(
        'SELECT shiftId, idx, startHHmm, endHHmm, required FROM kitchen_shifts WHERE userId = $1 ORDER BY idx ASC',
        [req.user.id]
      );
      if (kitchenShiftRows && kitchenShiftRows.length) {
        normalizedKitchenSettings = normalizeKitchenSettings({
          shifts: kitchenShiftRows.map(r => ({
            id: r.shiftid || r.shiftId,
            start: r.starthhmm || r.startHHmm,
            end: r.endhhmm || r.endHHmm,
            required: Number(r.required ?? 36),
          })),
        });
      } else {
        normalizedKitchenSettings = normalizeKitchenSettings(kitchenSettings);
      }
    } catch (e) {
      return res.status(400).json({ error: e?.message || 'Invalid kitchen settings' });
    }
    const kitchenShiftIdSet = new Set((normalizedKitchenSettings.shifts || []).map(s => s.id));
    const kitchenShiftById = new Map((normalizedKitchenSettings.shifts || []).map(s => [s.id, s]));

    const [peopleRows, postRows] = await Promise.all([
      db.all('SELECT * FROM people WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM posts WHERE userId = $1', [req.user.id]),
    ]);

    const personIds = new Set(peopleRows.map(p => p.id));
    // For rasar generation, filter by personId only - we need all existing duties for overlap detection
    const sanitizeByPerson = arr =>
      (arr || []).filter(a => personIds.has(a.personId));
    const sanitizeEs = arr =>
      (arr || []).map(es => ({
        groupId: es.groupId,
        personIds: (es.personIds || []).filter(pid => personIds.has(pid)),
      }));

    const sanitizedEs = sanitizeEs(esAssignments);
    const sanitizedAssignments = sanitizeByPerson(existingAssignments);
    const sanitizedBw = sanitizeByPerson(existingBwAssignments);
    let sanitizedKitchen = sanitizeKitchenByShiftIds(sanitizeByPerson(existingKitchenAssignments), kitchenShiftIdSet);
    const sanitizedEscort = sanitizeByPerson(existingEscortAssignments);
    const sanitizedRasar = sanitizeByPerson(existingRasarAssignments);
    const sanitizedEscort400 = sanitizeByPerson(existingEscort400Assignments);

    // Robustness: if client didn't send kitchen assignments (or sent empty), fall back to DB truth.
    if ((sanitizedKitchen?.length || 0) === 0) {
      const rows = await db.all('SELECT personId, day, shiftId FROM kitchen_assignments WHERE userId = $1', [req.user.id]);
      sanitizedKitchen = sanitizeKitchenByShiftIds(
        sanitizeByPerson(rows.map(r => ({ personId: Number(r.personid), day: r.day, shiftId: r.shiftid }))),
        kitchenShiftIdSet
      );
    }

    const overlapsIso = (aStart, aEnd, bStart, bEnd) => {
      const aS = dayjs(aStart);
      const aE = dayjs(aEnd);
      const bS = dayjs(bStart);
      const bE = dayjs(bEnd);
      if (
        (aE.isSame(bS, 'minute') || aE.isBefore(bS, 'minute')) ||
        (bE.isSame(aS, 'minute') || bE.isBefore(aS, 'minute'))
      ) return false;
      return aS.isBefore(bE) && bS.isBefore(aE);
    };
    const buildRasarRange = (day, shiftId) => {
      const def =
        shiftId === 'rasar_1' ? { start: '08:30', end: '11:30' } :
        shiftId === 'rasar_2' ? { start: '13:30', end: '17:30' } :
        shiftId === 'rasar_3' ? { start: '19:30', end: '20:30' } : null;
      if (!def) return null;
      return { start: dayjs(`${day}T${def.start}:00`).toISOString(), end: dayjs(`${day}T${def.end}:00`).toISOString() };
    };
    const buildEscort400Range = (day, shiftId) => {
      const def =
        shiftId === 'escort400_1' ? { start: '08:00', end: '12:30' } :
        shiftId === 'escort400_2' ? { start: '12:30', end: '17:00' } : null;
      if (!def) return null;
      return { start: dayjs(`${day}T${def.start}:00`).toISOString(), end: dayjs(`${day}T${def.end}:00`).toISOString() };
    };
    const buildBwRange = (day, slotId) => {
      const BW_SLOTS = [
        { id: 'bw_morning', start: '08:30', end: '11:30' },
        { id: 'bw_afternoon', start: '13:30', end: '17:30' },
        { id: 'bw_evening', start: '18:30', end: '20:00' },
      ];
      if (!day || !slotId) return null;
      const def = BW_SLOTS.find(s => s.id === slotId);
      if (!def) return null;
      const start = dayjs(`${day}T${def.start}:00`);
      let end = dayjs(`${day}T${def.end}:00`);
      if (!end.isAfter(start)) end = end.add(1, 'day');
      return { start: start.toISOString(), end: end.toISOString() };
    };
    const buildKitchenRange = (day, shiftId, kitchenSettingsRow) => {
      const s = kitchenShiftById.get(shiftId);
      if (!s) return null;
      return { start: dayjs(`${day}T${s.start}:00`).toISOString(), end: dayjs(`${day}T${s.end}:00`).toISOString() };
    };
    const buildEscortRange = (day, shiftId) => {
      const def =
        shiftId === 'escort_1' ? { start: '07:00', end: '10:30' } :
        shiftId === 'escort_2' ? { start: '10:30', end: '14:00' } :
        shiftId === 'escort_3' ? { start: '14:00', end: '17:00' } :
        shiftId === 'escort_4' ? { start: '17:00', end: '19:00' } : null;
      if (!def) return null;
      return { start: dayjs(`${day}T${def.start}:00`).toISOString(), end: dayjs(`${day}T${def.end}:00`).toISOString() };
    };

    const esMemberIds = new Set();
    for (const es of sanitizedEs) for (const pid of es.personIds) esMemberIds.add(Number(pid));

    const personGender = new Map(peopleRows.map(p => [Number(p.id), p.gender]));
    const rasarShiftIds = ['rasar_1', 'rasar_2', 'rasar_3'];
    const escort400ShiftIds = ['escort400_1', 'escort400_2'];
    const rasarWeekDays = () => {
      const out = [];
      const base = dayjs(effectiveStartISO).startOf('day');
      for (let i = 0; i < 5; i += 1) out.push(base.add(i, 'day').format('YYYY-MM-DD'));
      return out;
    };
    const requiredForRasar = (day, shiftId) => {
      const o = (rasarOverrides || []).find(x => x?.day === day && x?.shiftId === shiftId);
      const v = Number(o?.required ?? o?.requiredPerShift ?? 1);
      return Number.isFinite(v) ? Math.max(0, v) : 1;
    };
    const requiredForEscort400 = (day, shiftId) => {
      const o = (escort400Overrides || []).find(x => x?.day === day && x?.shiftId === shiftId);
      const v = Number(o?.required ?? o?.requiredPerShift ?? 1);
      return Number.isFinite(v) ? Math.max(0, v) : 1;
    };

    const validateGeneratedRasar = (rasarAssignments = [], escort400Assignments = []) => {
      // Build existing duty intervals by person (guards + bw + kitchen + escort)
      const existingByPerson = new Map();
      const addExisting = (pid, range) => {
        if (!range) return;
        const arr = existingByPerson.get(pid) || [];
        arr.push(range);
        existingByPerson.set(pid, arr);
      };

      for (const g of sanitizedAssignments) {
        // Prefer shiftLabel+day (matches UI labels and avoids any stale/incorrect start-end)
        if (g.day && g.shiftLabel) {
          const m = (g.shiftLabel || '').match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
          if (m) {
            const start = dayjs(`${g.day}T${m[1]}:${m[2]}:00`);
            let end = dayjs(`${g.day}T${m[3]}:${m[4]}:00`);
            if (!end.isAfter(start)) end = end.add(1, 'day');
            addExisting(Number(g.personId), { start: start.toISOString(), end: end.toISOString() });
            continue;
          }
        }
        if (g.start && g.end) addExisting(Number(g.personId), { start: g.start, end: g.end });
      }
      for (const b of sanitizedBw) addExisting(Number(b.personId), buildBwRange(b.day, b.slotId));
      // kitchen/escort may or may not include start/end in payload; use canonical
      for (const k of sanitizedKitchen) addExisting(Number(k.personId), buildKitchenRange(k.day, k.shiftId, null));
      for (const e of sanitizedEscort) addExisting(Number(e.personId), buildEscortRange(e.day, e.shiftId));

      const incomingRanges = [];
      for (const a of rasarAssignments) {
        const range = a.start && a.end ? { start: a.start, end: a.end } : buildRasarRange(a.day, a.shiftId);
        if (!range) continue;
        incomingRanges.push({ personId: Number(a.personId), range, day: a.day, shiftId: a.shiftId });
      }
      for (const a of escort400Assignments) {
        const range = a.start && a.end ? { start: a.start, end: a.end } : buildEscort400Range(a.day, a.shiftId);
        if (!range) continue;
        incomingRanges.push({ personId: Number(a.personId), range, day: a.day, shiftId: a.shiftId });
      }

      // Required-per-shift validation (otherwise client can show "schedule invalid" even if overlaps are fine)
      const violations = [];
      for (const day of rasarWeekDays()) {
        for (const shiftId of rasarShiftIds) {
          const required = requiredForRasar(day, shiftId);
          const count = (rasarAssignments || []).filter(a => a.day === day && a.shiftId === shiftId).length;
          if (count !== required) {
            violations.push({ personId: 0, message: `Missing/extra in rasar: ${day} ${shiftId} required ${required} has ${count}` });
          }
        }
        for (const shiftId of escort400ShiftIds) {
          const required = requiredForEscort400(day, shiftId);
          const count = (escort400Assignments || []).filter(a => a.day === day && a.shiftId === shiftId).length;
          if (count !== required) {
            violations.push({ personId: 0, message: `Missing/extra in escort400: ${day} ${shiftId} required ${required} has ${count}` });
          }
        }
      }
      if (violations.length) {
        return { ok: false, error: 'Required counts mismatch', violations };
      }

      // Female-only rule for escort400
      const bad400 = (escort400Assignments || [])
        .map(a => Number(a.personId))
        .filter(pid => (personGender.get(pid) || 'X') !== 'F');
      if (bad400.length) {
        const uniq = [...new Set(bad400)];
        return {
          ok: false,
          error: 'Escort400 gender rule',
          violations: uniq.map(pid => ({ personId: pid, message: 'Escort400 must be female' })),
        };
      }

      // ES check (ineligible)
      const esBad = [...new Set(incomingRanges.map(x => x.personId).filter(pid => esMemberIds.has(pid)))];
      if (esBad.length) {
        return {
          ok: false,
          error: `כ"כ`,
          violations: esBad.map(pid => ({ personId: pid, message: `כ"כ` })),
        };
      }

      // Constraint check
      for (const inc of incomingRanges) {
        for (const c of constraints || []) {
          if (Number(c.personId) !== inc.personId) continue;
          if (overlapsIso(inc.range.start, inc.range.end, c.startISO, c.endISO)) {
            return {
              ok: false,
              error: `Constraint conflict`,
              violations: [{ personId: inc.personId, message: `Constraint conflict (${inc.day} ${inc.shiftId})` }],
            };
          }
        }
      }

      // Existing duties overlap check
      for (const inc of incomingRanges) {
        const list = existingByPerson.get(inc.personId) || [];
        for (const ex of list) {
          if (overlapsIso(inc.range.start, inc.range.end, ex.start, ex.end)) {
            return {
              ok: false,
              error: `Overlap`,
              violations: [{ personId: inc.personId, message: `Overlap (${inc.day} ${inc.shiftId})` }],
            };
          }
        }
      }

      // Internal overlap check (same person in two incoming slots)
      const byPerson = new Map();
      for (const inc of incomingRanges) {
        const arr = byPerson.get(inc.personId) || [];
        arr.push(inc);
        byPerson.set(inc.personId, arr);
      }
      for (const [pid, list] of byPerson.entries()) {
        for (let i = 0; i < list.length; i += 1) {
          for (let j = i + 1; j < list.length; j += 1) {
            if (overlapsIso(list[i].range.start, list[i].range.end, list[j].range.start, list[j].range.end)) {
              return {
                ok: false,
                error: `Overlap`,
                violations: [{ personId: pid, message: `Overlap between ${list[i].day} ${list[i].shiftId} and ${list[j].day} ${list[j].shiftId}` }],
              };
            }
          }
        }
      }

      return { ok: true };
    };

    let result = null;
    let lastValidation = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const shuffledPeople = shuffle(peopleRows).map(mapPerson);
      result = scheduleGenerator(
        shuffledPeople,
        postRows.map(mapPost),
        effectiveStartISO,
        effectiveEndISO,
        [], // no guard overrides needed
        sanitizedEs,
        sanitizedAssignments,
        sanitizedBw,
        sanitizedKitchen,
        sanitizedEscort,
        normalizedKitchenSettings,
        escortSettings,
        constraints,
        {
          mode: 'rasar',
          existingRasarAssignments: sanitizedRasar,
          rasarStartISO: effectiveStartISO,
          rasarEndISO: effectiveEndISO,
          rasarOverrides,
          existingEscort400Assignments: sanitizedEscort400,
          escort400Overrides,
        }
      );

      if (result?.error) return respondError(res, result.error, result.missingCount ?? null);

      const v = validateGeneratedRasar(result?.rasarAssignments || [], result?.escort400Assignments || []);
      if (v.ok) {
        await Promise.all([
          persistRasarOnly(db, result.rasarAssignments || [], req.user.id),
          persistEscort400Only(db, result.escort400Assignments || [], req.user.id),
        ]);
        lastValidation = null;
        break;
      }
      lastValidation = v;
    }

    if (lastValidation) {
      const [guardsSnap, kitchenSnap] = await Promise.all([
        fetchGuardsSnapshot(db, req.user.id),
        fetchKitchenEscortSnapshot(db, req.user.id),
      ]);
      return res.json({
        ...guardsSnap,
        ...kitchenSnap,
        rasarAssignments: [],
        escort400Assignments: [],
        kitchenSettings: kitchenSnap.kitchenSettings,
        escortSettings: kitchenSnap.escortSettings,
        error: `Invalid rasar schedule: ${lastValidation.error}`,
        violations: lastValidation.violations || [],
      });
    }

    const [guardsSnap, kitchenSnap] = await Promise.all([
      fetchGuardsSnapshot(db, req.user.id),
      fetchKitchenEscortSnapshot(db, req.user.id),
    ]);

    res.json({
      ...guardsSnap,
      ...kitchenSnap,
      rasarAssignments: result.rasarAssignments || [],
      escort400Assignments: result.escort400Assignments || [],
      kitchenSettings: kitchenSnap.kitchenSettings,
      escortSettings: kitchenSnap.escortSettings,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/save-rasar', async (req, res, next) => {
  try {
    const db = getDb(req);
    const { rasarAssignments = [], escort400Assignments = [] } = req.body || {};
    const peopleRows = await db.all('SELECT id, name, gender FROM people WHERE userId = $1', [req.user.id]);
    const personIds = new Set(peopleRows.map(p => p.id));
    const femaleIds = new Set(peopleRows.filter(p => p.gender === 'F').map(p => p.id));
    const sanitized = (rasarAssignments || []).filter(a => personIds.has(a.personId));
    const sanitized400 = (escort400Assignments || []).filter(a => femaleIds.has(a.personId));

    // Reject overlaps with existing duties before persisting.
    const overlapsIso = (aStart, aEnd, bStart, bEnd) => {
      const aS = dayjs(aStart);
      const aE = dayjs(aEnd);
      const bS = dayjs(bStart);
      const bE = dayjs(bEnd);
      if (
        (aE.isSame(bS, 'minute') || aE.isBefore(bS, 'minute')) ||
        (bE.isSame(aS, 'minute') || bE.isBefore(aS, 'minute'))
      ) return false;
      return aS.isBefore(bE) && bS.isBefore(aE);
    };
    const buildRasarRange = (day, shiftId) => {
      const def =
        shiftId === 'rasar_1' ? { start: '08:30', end: '11:30' } :
        shiftId === 'rasar_2' ? { start: '13:30', end: '17:30' } :
        shiftId === 'rasar_3' ? { start: '19:30', end: '20:30' } : null;
      if (!def) return null;
      return { start: dayjs(`${day}T${def.start}:00`).toISOString(), end: dayjs(`${day}T${def.end}:00`).toISOString() };
    };
    const buildEscort400Range = (day, shiftId) => {
      const def =
        shiftId === 'escort400_1' ? { start: '08:00', end: '12:30' } :
        shiftId === 'escort400_2' ? { start: '12:30', end: '17:00' } : null;
      if (!def) return null;
      return { start: dayjs(`${day}T${def.start}:00`).toISOString(), end: dayjs(`${day}T${def.end}:00`).toISOString() };
    };
    const buildEscortRange = (day, shiftId) => {
      const def =
        shiftId === 'escort_1' ? { start: '07:00', end: '10:30' } :
        shiftId === 'escort_2' ? { start: '10:30', end: '14:00' } :
        shiftId === 'escort_3' ? { start: '14:00', end: '17:00' } :
        shiftId === 'escort_4' ? { start: '17:00', end: '19:00' } : null;
      if (!def) return null;
      return { start: dayjs(`${day}T${def.start}:00`).toISOString(), end: dayjs(`${day}T${def.end}:00`).toISOString() };
    };

    const [guardsRows, bwRows, kitchenRows, escortRows, kitchenShiftRows, kitchenSettingsRows, esRows] = await Promise.all([
      db.all('SELECT personId, startISO, endISO FROM assignments WHERE userId = $1', [req.user.id]),
      // bw_assignments table does NOT store start/end timestamps (day+slotId only)
      db.all('SELECT personId, day, slotId FROM bw_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT personId, day, shiftId FROM kitchen_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT personId, day, shiftId FROM escort_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT shiftId, idx, startHHmm, endHHmm FROM kitchen_shifts WHERE userId = $1 ORDER BY idx ASC', [req.user.id]),
      db.all('SELECT * FROM kitchen_settings WHERE userId = $1 LIMIT 1', [req.user.id]),
      db.all('SELECT groupId, personId FROM es_assignments WHERE userId = $1', [req.user.id]),
    ]);

    let kitchenSettingsForOverlap = null;
    if (kitchenShiftRows && kitchenShiftRows.length) {
      kitchenSettingsForOverlap = {
        shifts: kitchenShiftRows.map(r => ({
          id: r.shiftid || r.shiftId,
          start: r.starthhmm || r.startHHmm,
          end: r.endhhmm || r.endHHmm,
          required: 0,
        })),
      };
    } else {
      const legacy = kitchenSettingsRows?.[0]
        ? {
          requiredShift1: Number(kitchenSettingsRows[0].requiredshift1 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
          requiredShift2: Number(kitchenSettingsRows[0].requiredshift2 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
          shift2Start: kitchenSettingsRows[0].shift2start
        }
        : { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' };
      kitchenSettingsForOverlap = normalizeKitchenSettings(legacy);
    }
    kitchenSettingsForOverlap = normalizeKitchenSettings(kitchenSettingsForOverlap);
    const kitchenShiftById = new Map((kitchenSettingsForOverlap.shifts || []).map(s => [s.id, s]));
    const buildKitchenRange = (day, shiftId) => {
      const s = kitchenShiftById.get(shiftId);
      if (!s) return null;
      return { start: dayjs(`${day}T${s.start}:00`).toISOString(), end: dayjs(`${day}T${s.end}:00`).toISOString() };
    };

    // Build ES group membership map
    const personToESGroup = new Map();
    for (const row of esRows) {
      personToESGroup.set(Number(row.personid), row.groupid);
    }
    const esMemberIds = new Set([...personToESGroup.keys()]);

    const BW_SLOTS = [
      { id: 'bw_morning', start: '08:30', end: '11:30' },
      { id: 'bw_afternoon', start: '13:30', end: '17:30' },
      { id: 'bw_evening', start: '18:30', end: '20:00' },
    ];
    const buildBwRange = (day, slotId) => {
      if (!day || !slotId) return null;
      const def = BW_SLOTS.find(s => s.id === slotId);
      if (!def) return null;
      const start = dayjs(`${day}T${def.start}:00`);
      let end = dayjs(`${day}T${def.end}:00`);
      if (!start.isValid() || !end.isValid()) return null;
      if (!end.isAfter(start)) end = end.add(1, 'day');
      return { start: start.toISOString(), end: end.toISOString() };
    };

    const existingByPerson = new Map(); // personId -> [{start,end,label}]
    const addExisting = (pid, range, label) => {
      if (!range) return;
      const arr = existingByPerson.get(pid) || [];
      arr.push({ ...range, label });
      existingByPerson.set(pid, arr);
    };

    for (const r of guardsRows) {
      if (r.startiso && r.endiso) addExisting(Number(r.personid), { start: r.startiso, end: r.endiso }, `Guards ${r.startiso}–${r.endiso}`);
    }
    for (const r of bwRows) {
      addExisting(Number(r.personid), buildBwRange(r.day, r.slotid), `BW ${r.day} ${r.slotid}`);
    }
    for (const r of kitchenRows) {
      addExisting(Number(r.personid), buildKitchenRange(r.day, r.shiftid), `Kitchen ${r.day} ${r.shiftid}`);
    }
    for (const r of escortRows) {
      addExisting(Number(r.personid), buildEscortRange(r.day, r.shiftid), `Escort ${r.day} ${r.shiftid}`);
    }

    const incomingRanges = [];
    for (const a of sanitized) {
      const range = buildRasarRange(a.day, a.shiftId);
      if (!range) continue;
      incomingRanges.push({ personId: Number(a.personId), day: a.day, shiftId: a.shiftId, range });
    }
    for (const a of sanitized400) {
      const range = buildEscort400Range(a.day, a.shiftId);
      if (!range) continue;
      incomingRanges.push({ personId: Number(a.personId), day: a.day, shiftId: a.shiftId, range });
    }

    // Check overlaps inside the incoming rasar/escort400 payload itself (rasar vs rasar, 400 vs 400, rasar vs 400)
    const incomingByPerson = new Map();
    for (const inc of incomingRanges) {
      const arr = incomingByPerson.get(inc.personId) || [];
      arr.push(inc);
      incomingByPerson.set(inc.personId, arr);
    }
    for (const [pid, list] of incomingByPerson.entries()) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i];
          const b = list[j];
          if (overlapsIso(a.range.start, a.range.end, b.range.start, b.range.end)) {
            const personName = peopleRows.find(p => p.id === pid)?.name || String(pid);
            return res.json({
              ok: false,
              error: `Overlap: ${personName}`,
              violations: [
                {
                  personId: pid,
                  message: `Overlap between ${a.day} ${a.shiftId} and ${b.day} ${b.shiftId}`,
                },
              ],
            });
          }
        }
      }
    }

    // ES (כ"כ): members should not be assigned to rasar/escort400 at all.
    const esViolators = incomingRanges.map(x => x.personId).filter(pid => esMemberIds.has(pid));
    if (esViolators.length > 0) {
      const unique = [...new Set(esViolators)];
      const names = unique.map(pid => peopleRows.find(p => p.id === pid)?.name || String(pid));
      return res.json({
        ok: false,
        error: `כ"כ: ${names.join(', ')}`,
        violations: unique.map(pid => ({
          personId: pid,
          message: `כ"כ`,
        })),
      });
    }

    for (const inc of incomingRanges) {
      const list = existingByPerson.get(inc.personId) || [];
      for (const ex of list) {
        if (overlapsIso(inc.range.start, inc.range.end, ex.start, ex.end)) {
          const personName = peopleRows.find(p => p.id === inc.personId)?.name || String(inc.personId);
          return res.json({
            ok: false,
            error: `Overlap: ${personName}`,
            violations: [
              {
                personId: inc.personId,
                message: `Overlap with ${ex.label || 'existing duty'}`,
              },
            ],
          });
        }
      }
    }

    await Promise.all([
      persistRasarOnly(db, sanitized, req.user.id),
      persistEscort400Only(db, sanitized400, req.user.id),
    ]);
    res.json({ ok: true });
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
      rasarAssignments = [],
      escort400Assignments = [],
      kitchenSettings,
      escortSettings,
      start,
      end,
    } = req.body;

    let normalizedKitchenSettings = null;
    try {
      normalizedKitchenSettings = normalizeKitchenSettings(kitchenSettings);
    } catch (e) {
      return res.status(400).json({ error: e?.message || 'Invalid kitchen settings' });
    }
    const kitchenShiftIdSet = new Set((normalizedKitchenSettings.shifts || []).map(s => s.id));
    const [peopleRows, postRows] = await Promise.all([
      db.all('SELECT id FROM people WHERE userId = $1', [req.user.id]),
      db.all('SELECT id FROM posts WHERE userId = $1', [req.user.id]),
    ]);
    const personIds = new Set(peopleRows.map(p => p.id));
    const postIds = new Set(postRows.map(p => p.id));
    const sanitizedAssignments = assignments.filter(a => personIds.has(a.personId) && postIds.has(a.postId));
    const sanitizedBw = bwAssignments.filter(a => personIds.has(a.personId));
    const sanitizedKitchen = sanitizeKitchenByShiftIds(kitchenAssignments.filter(a => personIds.has(a.personId)), kitchenShiftIdSet);
    const sanitizedEscort = escortAssignments.filter(a => personIds.has(a.personId));
    const sanitizedRasar = rasarAssignments.filter(a => personIds.has(a.personId));
    const sanitizedEscort400 = escort400Assignments.filter(a => personIds.has(a.personId));
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
      sanitizedRasar,
      sanitizedEscort400,
      normalizedKitchenSettings,
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
    const [regular, bw, es, kitchen, escort, rasar, escort400, kitchenSnap, escortSettingsRows] = await Promise.all([
      db.all('SELECT * FROM assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM bw_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM es_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM kitchen_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM escort_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM rasar_assignments WHERE userId = $1', [req.user.id]),
      db.all('SELECT * FROM escort400_assignments WHERE userId = $1', [req.user.id]),
      fetchKitchenEscortSnapshot(db, req.user.id),
      db.all('SELECT * FROM escort_settings WHERE userId = $1 LIMIT 1', [req.user.id]),
    ]);
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
      rasarAssignments: rasar.map(mapRasarAssignment),
      escort400Assignments: escort400.map(mapEscort400Assignment),
      kitchenSettings: kitchenSnap.kitchenSettings,
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
    } else if (mode === 'rasar') {
      await Promise.all([clearRasarAssignments(db, req.user.id), clearEscort400Assignments(db, req.user.id)]);
    } else {
      await Promise.all([
        clearAssignments(db, req.user.id),
        clearBwAssignments(db, req.user.id),
        clearEsAssignments(db, req.user.id),
        clearKitchenAssignments(db, req.user.id),
        clearEscortAssignments(db, req.user.id),
        clearRasarAssignments(db, req.user.id),
        clearEscort400Assignments(db, req.user.id),
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
    const [regular, bw, es, kitchen, escort, kitchenShiftRows, kitchenSettingsRows, escortSettingsRows] = await Promise.all([
      db.all(`SELECT * FROM archived_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3`, [start, end, req.user.id]),
      db.all('SELECT * FROM archived_bw_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_es_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_kitchen_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_escort_assignments WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT shiftId, idx, startHHmm, endHHmm, required FROM archived_kitchen_shifts WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3 ORDER BY idx ASC', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_kitchen_settings WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
      db.all('SELECT * FROM archived_escort_settings WHERE schedule_start = $1 AND schedule_end = $2 AND userId = $3', [start, end, req.user.id]),
    ]);
    console.log('Found assignments:', regular.length, 'bw:', bw.length, 'es:', es.length);

    let kitchenSettings = null;
    if (kitchenShiftRows && kitchenShiftRows.length) {
      kitchenSettings = {
        shifts: kitchenShiftRows.map(r => ({
          id: r.shiftid || r.shiftId,
          start: r.starthhmm || r.startHHmm,
          end: r.endhhmm || r.endHHmm,
          required: Number(r.required ?? 36),
        })),
      };
    } else {
      const legacy = kitchenSettingsRows?.[0]
        ? {
          requiredShift1: Number(kitchenSettingsRows[0].requiredshift1 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
          requiredShift2: Number(kitchenSettingsRows[0].requiredshift2 ?? kitchenSettingsRows[0].requiredpershift ?? 36),
          shift2Start: kitchenSettingsRows[0].shift2start
        }
        : { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' };
      kitchenSettings = normalizeKitchenSettings(legacy);
    }
    kitchenSettings = normalizeKitchenSettings(kitchenSettings);

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

router.get('/justice', async (req, res, next) => {
  try {
    const db = getDb(req);
    const mode = (req.query?.mode || 'all').toString(); // 'all' | 'range'
    const startISO = (req.query?.startISO || req.query?.start || '').toString();
    const endISO = (req.query?.endISO || req.query?.end || '').toString();
    if (mode === 'range' && (!startISO || !endISO)) {
      return res.status(400).json({ error: 'startISO and endISO query parameters required' });
    }

    const rows = await dutyHoursFromArchived(
      db,
      req.user.id,
      mode === 'range' ? startISO : null,
      mode === 'range' ? endISO : null
    );
    res.json({ rows });
  } catch (err) {
    next(err);
  }
});

export default router;
