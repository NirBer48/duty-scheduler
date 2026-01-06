import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

// Configuration constants - can be overridden by environment variables
const STANDING_EXEMPT_POST_NAMES = process.env.STANDING_EXEMPT_POST_NAMES
  ? JSON.parse(process.env.STANDING_EXEMPT_POST_NAMES)
  : ["שג רגלי", "ימח", "שג רכוב אחורי", "שג רכוב קדמי", "עתודה"];

const BW_SLOTS = [
  { id: 'bw_morning', label: 'BW 08:30-11:30', startHour: 8, startMinute: 30, endHour: 11, endMinute: 30 },
  { id: 'bw_afternoon', label: 'BW 13:30-17:30', startHour: 13, startMinute: 30, endHour: 17, endMinute: 30 },
  { id: 'bw_evening', label: 'BW 18:30-20:00', startHour: 18, startMinute: 30, endHour: 20, endMinute: 0 },
];

const BW_REQUIRED = parseInt(process.env.BW_REQUIRED) || 20;
const NIGHT_SHIFT_LABELS = new Set(['20:00-00:00', '00:00-04:00', '04:00-08:00']);

const isNightShiftLabel = (label) => {
  // Check exact matches first
  if (NIGHT_SHIFT_LABELS.has(label)) return true;

  // Parse shift label to check if it overlaps with night hours (20:00-08:00)
  const match = label.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!match) return false;

  const startHour = parseInt(match[1]);
  const startMinute = parseInt(match[2]);
  const endHour = parseInt(match[3]);
  const endMinute = parseInt(match[4]);

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  // Night period: 20:00 to 08:00 (wraps around midnight)
  // A shift is a night shift if it starts OR ends in the night period
  // Night period: 20:00-23:59 (same day) OR 00:00-07:59 (next day)

  // Check if shift starts in night period
  const startsInNight = (startMinutes >= 20 * 60) || (startMinutes < 8 * 60);

  // Check if shift ends in night period
  const endsInNight = (endMinutes > 20 * 60) || (endMinutes <= 8 * 60);

  // Also check if shift crosses midnight and overlaps with night
  const crossesMidnight = endMinutes <= startMinutes;
  if (crossesMidnight) {
    // Shift crosses midnight, so it definitely overlaps with night period
    return true;
  }

  return startsInNight || endsInNight;
};

const computeBWDays = (startISO, endISO, existingBwAssignments = []) => {
  const start = dayjs(startISO);
  const end = dayjs(endISO);
  const rangeStart = start.startOf('day');
  const rangeEnd = end.endOf('day');
  const daysSet = new Set();

  const addDayIfApplicable = dayMoment => {
    const normalized = dayjs(dayMoment).startOf('day');
    if (normalized.isBefore(rangeStart) || normalized.isAfter(rangeEnd)) {
      return;
    }
    const hasSlotWithinRange = BW_SLOTS.some(slot => {
      const slotStart = normalized.add(slot.startHour, 'hour').add(slot.startMinute, 'minute');
      let slotEnd = normalized.add(slot.endHour, 'hour').add(slot.endMinute, 'minute');
      if (!slotEnd.isAfter(slotStart)) {
        slotEnd = slotEnd.add(1, 'day');
      }
      return slotEnd.isAfter(start) && slotStart.isBefore(end);
    });
    if (hasSlotWithinRange) {
      daysSet.add(normalized.format('YYYY-MM-DD'));
    }
  };

  existingBwAssignments.forEach(bw => addDayIfApplicable(bw.day));

  let cursor = rangeStart.clone();
  while (cursor.isBefore(rangeEnd) || cursor.isSame(rangeEnd, 'day')) {
    addDayIfApplicable(cursor);
    cursor = cursor.add(1, 'day');
  }

  return Array.from(daysSet).sort();
};

export const scheduleGenerator = (
  people,
  posts,
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
  options = {}
) => {
  const mode = options?.mode || 'all'; // 'all' | 'guards' | 'kitchen' | 'rasar'
  const existingRasarAssignments = options?.existingRasarAssignments || [];
  const rasarStartISO = options?.rasarStartISO || startISO;
  const rasarEndISO = options?.rasarEndISO || endISO;
  const rasarOverrides = options?.rasarOverrides || [];
  const existingEscort400Assignments = options?.existingEscort400Assignments || [];
  const escort400Overrides = options?.escort400Overrides || [];

  // Random tie-breaker to ensure schedules vary between runs even when "workload" is equal.
  const randomRank = new Map();
  for (const p of people || []) randomRank.set(p.id, Math.random());
  const tieBreakRandom = (a, b) => (randomRank.get(a.id) ?? 0) - (randomRank.get(b.id) ?? 0);

  const genGuards = mode === 'all' || mode === 'guards';
  const genKitchenEscort = mode === 'all' || mode === 'kitchen';
  const genRasar = mode === 'all' || mode === 'rasar';
  // Build all 4-hour shift time slots between start and end
  const shiftDefinitions = [
    { label: '00:00-04:00', startOffset: 0, endOffset: 4 },
    { label: '04:00-08:00', startOffset: 4, endOffset: 8 },
    { label: '08:00-12:00', startOffset: 8, endOffset: 12 },
    { label: '12:00-16:00', startOffset: 12, endOffset: 16 },
    { label: '16:00-20:00', startOffset: 16, endOffset: 20 },
    { label: '20:00-00:00', startOffset: 20, endOffset: 24 },
  ];

  const getRequiredCount = (postId, day, shiftLabel, defaultRequired) => {
    const override = shiftOverrides.find(o =>
      o.postId === postId && o.day === day && o.shiftLabel === shiftLabel
    );
    return override ? override.requiredPerShift : defaultRequired;
  };

  // Build standing-exempt post IDs from names list
  const standingExemptPostIds = new Set(
    posts
      .filter(p => STANDING_EXEMPT_POST_NAMES.some(exemptName => p.name.includes(exemptName)))
      .map(p => p.id)
  );

  // Build ES group membership map: personId -> groupId
  const personToESGroup = new Map();
  for (const es of esAssignments) {
    for (const personId of es.personIds) {
      const numericId = Number(personId);
      personToESGroup.set(numericId, es.groupId);
    }
  }

  // Track per-person: assigned shifts (for rest tracking) and total shift count
  const personShifts = new Map(); // personId -> array of { start, end, day, shiftLabel }
  const shiftCountByPerson = {};
  const bwAssignmentCount = {};
  const kitchenAssignmentCount = {};
  const escortAssignmentCount = {};
  const rasarAssignmentCount = {};
  const escort400AssignmentCount = {};
  people.forEach(p => {
    personShifts.set(p.id, []);
    shiftCountByPerson[p.id] = 0;
    bwAssignmentCount[p.id] = 0;
    kitchenAssignmentCount[p.id] = 0;
    escortAssignmentCount[p.id] = 0;
    rasarAssignmentCount[p.id] = 0;
    escort400AssignmentCount[p.id] = 0;
  });

  // Constraints map: personId -> [{start,end,title}]
  const constraintsByPerson = new Map();
  for (const c of constraints) {
    const arr = constraintsByPerson.get(c.personId) || [];
    arr.push({
      start: dayjs(c.startISO),
      end: dayjs(c.endISO),
      title: c.title || '',
    });
    constraintsByPerson.set(c.personId, arr);
  }

  // Returns true if a person has any constraint overlapping [slotStart, slotEnd).
  // Adjacent boundaries (constraint ends exactly at slot start, etc) are NOT treated as overlap.
  const violatesConstraint = (personId, slotStartISO, slotEndISO) => {
    const cList = constraintsByPerson.get(personId) || [];
    if (cList.length === 0) return false;
    const slotStart = dayjs(slotStartISO);
    const slotEnd = dayjs(slotEndISO);
    for (const c of cList) {
      // Exclude adjacent ranges (one ends when the other starts) - use minute precision
      if (
        (slotEnd.isSame(c.start, 'minute') || slotEnd.isBefore(c.start, 'minute')) ||
        (c.end.isSame(slotStart, 'minute') || c.end.isBefore(slotStart, 'minute'))
      ) {
        continue;
      }
      if (slotStart.isBefore(c.end) && c.start.isBefore(slotEnd)) return true;
    }
    return false;
  };

  // Build list of all shift time slots in the date range
  const timeSlots = [];

  // Parse as local time (not UTC): extract YYYY-MM-DDTHH:mm and rebuild as local
  // Treat incoming strings as local times (no TZ shift)
  const parseLocalDateTime = (isoString) => dayjs(isoString);

  const startDt = parseLocalDateTime(startISO).second(0).millisecond(0);
  const endDt = parseLocalDateTime(endISO).second(0).millisecond(0);

  // Track non-guard duty intervals per person for overlap checks (BW + kitchen + escort + rasar + escort400)
  // IMPORTANT: we seed existing extra duties BEFORE guard assignment so guards won't overlap them.
  const extraDutyIntervals = new Map(); // personId -> [{start,end,type}]
  const addExtraInterval = (personId, start, end, type) => {
    if (!extraDutyIntervals.has(personId)) extraDutyIntervals.set(personId, []);
    extraDutyIntervals.get(personId).push({ start, end, type });
  };

  const overlapsIso = (aStartISO, aEndISO, bStartISO, bEndISO) => {
    const aStart = dayjs(aStartISO);
    const aEnd = dayjs(aEndISO);
    const bStart = dayjs(bStartISO);
    const bEnd = dayjs(bEndISO);
    // Exclude adjacent shifts (one ends when the other starts) - use minute precision
    if (
      (aEnd.isSame(bStart, 'minute') || aEnd.isBefore(bStart, 'minute')) ||
      (bEnd.isSame(aStart, 'minute') || bEnd.isBefore(aStart, 'minute'))
    ) {
      return false;
    }
    return aStart.isBefore(bEnd) && bStart.isBefore(aEnd);
  };

  const overlapsWithExtraDuties = (personId, slotStartISO, slotEndISO) => {
    const list = extraDutyIntervals.get(personId) || [];
    for (const interval of list) {
      if (overlapsIso(interval.start, interval.end, slotStartISO, slotEndISO)) return true;
    }
    return false;
  };

  const formatShiftLabel = (start, end) => `${start.format('HH:mm')}-${end.format('HH:mm')}`;

  // Add the first partial shift (from custom start to next 4-hour boundary)
  const addFirstShift = () => {
    const startMinutes = startDt.hour() * 60 + startDt.minute();
    const nextBoundaryMinutes = Math.ceil(startMinutes / 240) * 240;
    const minutesToAdd = nextBoundaryMinutes - startMinutes;
    const tentativeEnd = startDt.add(minutesToAdd || 240, 'minute'); // if exactly on boundary, make 4h
    const firstEnd = tentativeEnd.isAfter(endDt) ? endDt : tentativeEnd;
    timeSlots.push({
      day: startDt.format('YYYY-MM-DD'),
      shiftLabel: formatShiftLabel(startDt, firstEnd),
      start: startDt.toISOString(),
      end: firstEnd.toISOString(),
      index: timeSlots.length,
    });
    return firstEnd;
  };

  // Add middle standard 4-hour shifts until the last boundary
  const addStandardShifts = (cursor, lastBoundary) => {
    let curr = cursor;
    while (curr.add(4, 'hour').isBefore(lastBoundary) || curr.add(4, 'hour').isSame(lastBoundary)) {
      const shiftEnd = curr.add(4, 'hour');
      timeSlots.push({
        day: curr.format('YYYY-MM-DD'),
        shiftLabel: formatShiftLabel(curr, shiftEnd),
        start: curr.toISOString(),
        end: shiftEnd.toISOString(),
        index: timeSlots.length,
      });
      curr = shiftEnd;
    }
    return curr;
  };

  // Add the last partial shift (from last boundary to custom end)
  const addLastShift = (cursor) => {
    if (cursor.isBefore(endDt)) {
      timeSlots.push({
        day: cursor.format('YYYY-MM-DD'),
        shiftLabel: formatShiftLabel(cursor, endDt),
        start: cursor.toISOString(),
        end: endDt.toISOString(),
        index: timeSlots.length,
      });
    }
  };

  // Compute boundaries
  const endMinutes = endDt.hour() * 60 + endDt.minute();
  let lastBoundaryMinutes = Math.floor(endMinutes / 240) * 240;
  let lastBoundary = endDt.startOf('day').add(lastBoundaryMinutes, 'minute');
  if (lastBoundary.isAfter(endDt)) {
    lastBoundary = lastBoundary.subtract(4, 'hour');
  }

  const afterFirst = addFirstShift();
  // Ensure last boundary is not before we start standard shifts
  if (lastBoundary.isBefore(afterFirst)) {
    lastBoundary = afterFirst;
  }
  const afterStandards = addStandardShifts(afterFirst, lastBoundary);
  addLastShift(afterStandards);

  // Create a lookup for time slot index by day+shiftLabel
  const timeSlotIndex = new Map();
  for (const ts of timeSlots) {
    timeSlotIndex.set(`${ts.day}|${ts.shiftLabel}`, ts.index);
  }

  // Create a map of existing assignments by slot key
  const existingBySlot = new Map();
  for (const ea of existingAssignments) {
    const key = `${ea.postId}|${ea.day}|${ea.shiftLabel}`;
    if (!existingBySlot.has(key)) {
      existingBySlot.set(key, []);
    }
    existingBySlot.get(key).push(Number(ea.personId));
  }

  // Pre-process existing assignments - track ALL existing assignments for rest checking
  for (const ea of existingAssignments) {
    const personId = Number(ea.personId);
    const tsKey = `${ea.day}|${ea.shiftLabel}`;

    // Initialize person if not in people list (shouldn't happen but be safe)
    if (!personShifts.has(personId)) {
      personShifts.set(personId, []);
    }
    if (shiftCountByPerson[personId] === undefined) {
      shiftCountByPerson[personId] = 0;
    }

    // Prefer explicit timestamps if they exist (critical for overlap checks when the shiftLabel isn't a standard 4h block)
    // This also makes rasar generation reliably "see" guard duties even if the rasar week range differs.
    if (ea.start && ea.end) {
      const start = dayjs(ea.start);
      const end = dayjs(ea.end);
      const firstSlotDate = dayjs(timeSlots[0]?.start || startISO);
      const minutesDiff = start.diff(firstSlotDate, 'minute');
      const virtualIndex = Math.floor(minutesDiff / 240);
      personShifts.get(personId).push({
        start: start.toISOString(),
        end: end.toISOString(),
        day: ea.day,
        shiftLabel: ea.shiftLabel,
        index: Number.isFinite(virtualIndex) ? virtualIndex : 0,
      });
      shiftCountByPerson[personId]++;
      continue;
    }

    // Find or calculate the time slot info
    const ts = timeSlots.find(t => t.day === ea.day && t.shiftLabel === ea.shiftLabel);

    if (ts) {
      // Slot is within our time range
      personShifts.get(personId).push({
        start: ts.start,
        end: ts.end,
        day: ea.day,
        shiftLabel: ea.shiftLabel,
        index: ts.index,
      });
    } else {
      // Slot is outside our time range - still need to track for rest violations
      // Calculate a virtual index based on the shift time
      const shiftDef = shiftDefinitions.find(s => s.label === ea.shiftLabel);
      if (shiftDef) {
        // Parse the day and calculate relative position
        const slotDate = dayjs(ea.day).hour(shiftDef.startOffset);
        const firstSlotDate = dayjs(timeSlots[0]?.start || startISO);
        const hoursDiff = slotDate.diff(firstSlotDate, 'hour');
        const virtualIndex = Math.floor(hoursDiff / 4);

        personShifts.get(personId).push({
          start: slotDate.toISOString(),
          end: slotDate.add(4, 'hour').toISOString(),
          day: ea.day,
          shiftLabel: ea.shiftLabel,
          index: virtualIndex,
        });
      }
    }

    shiftCountByPerson[personId]++;
  }

  // Build all slots that need to be filled
  const slotsToFill = [];
  if (genGuards) {
    for (const ts of timeSlots) {
      for (const post of posts) {
        const required = getRequiredCount(post.id, ts.day, ts.shiftLabel, post.requiredPerShift);
        const slotKey = `${post.id}|${ts.day}|${ts.shiftLabel}`;
        const existingCount = (existingBySlot.get(slotKey) || []).length;
        const stillNeeded = required - existingCount;

        if (stillNeeded > 0) {
          slotsToFill.push({
            day: ts.day,
            shiftLabel: ts.shiftLabel,
            start: ts.start,
            end: ts.end,
            index: ts.index,
            postId: post.id,
            postName: post.name,
            required: required,
            stillNeeded: stillNeeded,
            optional: !!post.optional || required === 0,
          });
        }
      }
    }
  }

  // Sort slots by time
  slotsToFill.sort((a, b) => a.start.localeCompare(b.start));

  const assignments = [];

  // Copy existing assignments to final list
  for (const ea of existingAssignments) {
    const ts = timeSlots.find(t => t.day === ea.day && t.shiftLabel === ea.shiftLabel);
    if (ts) {
      assignments.push({
        postId: Number(ea.postId),
        personId: Number(ea.personId),
        shiftLabel: ea.shiftLabel,
        start: ts.start,
        end: ts.end,
        day: ea.day,
      });
    }
  }

  // Track assignments per slot for ES group checking
  const slotAssignments = new Map(); // `${day}|${shiftLabel}` -> Set of personIds
  for (const ea of existingAssignments) {
    const key = `${ea.day}|${ea.shiftLabel}`;
    if (!slotAssignments.has(key)) {
      slotAssignments.set(key, new Set());
    }
    slotAssignments.get(key).add(Number(ea.personId));
  }

  const getShiftKey = (day, shiftLabel) => `${day}|${shiftLabel}`;

  const canESMemberWorkAtShift = (personId, day, shiftLabel) => {
    const groupId = personToESGroup.get(personId);
    if (!groupId) return true;

    const key = getShiftKey(day, shiftLabel);
    const assignedPeople = slotAssignments.get(key) || new Set();

    for (const assignedId of assignedPeople) {
      if (assignedId !== personId && personToESGroup.get(assignedId) === groupId) {
        return false;
      }
    }
    return true;
  };

  const hasRestViolation = (personId, slotIndex) => {
    const shifts = personShifts.get(personId) || [];
    for (const shift of shifts) {
      const diff = Math.abs(slotIndex - shift.index);
      if (diff > 0 && diff < 3) {
        return true;
      }
    }
    return false;
  };

  const hasOverlappingBWAssignment = (personId, slotStart, slotEnd) => {
    for (const bw of existingBwAssignments) {
      if (Number(bw.personId) !== personId) continue;
      const slot = BW_SLOTS.find(s => s.id === bw.slotId);
      if (!slot) continue;

      const pad = value => String(value).padStart(2, '0');
      const bwStart = dayjs(`${bw.day}T${pad(slot.startHour)}:${pad(slot.startMinute)}:00`);
      let bwEndDay = bw.day;
      if (slot.endHour < slot.startHour || (slot.endHour === slot.startHour && slot.endMinute <= slot.startMinute)) {
        bwEndDay = dayjs(bw.day).add(1, 'day').format('YYYY-MM-DD');
      }
      const bwEnd = dayjs(`${bwEndDay}T${pad(slot.endHour)}:${pad(slot.endMinute)}:00`);

      const shiftStart = dayjs(slotStart);
      const shiftEnd = dayjs(slotEnd);

      if (shiftStart.isBefore(bwEnd) && bwStart.isBefore(shiftEnd)) {
        return true;
      }
    }
    return false;
  };

  // Seed extra-duty intervals from existing kitchen/escort/rasar/escort400 so guards won't overlap them.
  // We compute canonical times for these shiftIds.
  const pad = value => String(value).padStart(2, '0');
  const scheduleStart = parseLocalDateTime(startISO);
  const scheduleEnd = parseLocalDateTime(endISO);

  const parseHHmmToHM = (value, fallback) => {
    const str = (value || fallback || '').toString();
    const m = str.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return { hour: 0, minute: 0, str: (fallback || '00:00').toString() };
    let hour = Number(m[1]);
    let minute = Number(m[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return { hour: 0, minute: 0, str: (fallback || '00:00').toString() };
    hour = Math.min(23, Math.max(0, hour));
    minute = Math.min(59, Math.max(0, minute));
    const out = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return { hour, minute, str: out };
  };

  const normalizeKitchenShiftList = (ks) => {
    const raw = Array.isArray(ks?.shifts) ? ks.shifts : null;
    const shifts = (raw && raw.length) ? raw : [{ id: 'default', start: '06:00', end: '21:00', required: 36 }];
    return shifts.map((s, idx) => ({
      id: (s?.id ?? `kitchen_${idx}`).toString(),
      start: parseHHmmToHM(s?.start, idx === 0 ? '06:00' : '06:00').str,
      end: parseHHmmToHM(s?.end, idx === shifts.length - 1 ? '21:00' : '21:00').str,
      required: Math.max(0, Number(s?.required ?? 36) || 0),
    }));
  };

  const kitchenShiftList = normalizeKitchenShiftList(kitchenSettings);
  const kitchenShiftDefsAll = kitchenShiftList
    .map(s => {
      const st = parseHHmmToHM(s.start, '06:00');
      const en = parseHHmmToHM(s.end, '21:00');
      return {
        id: s.id,
        startHour: st.hour,
        startMinute: st.minute,
        endHour: en.hour,
        endMinute: en.minute,
        label: `${st.str}-${en.str}`,
        required: s.required,
      };
    })
    .filter(d => (d.startHour * 60 + d.startMinute) < (d.endHour * 60 + d.endMinute));

  const seedKitchenEscortIntervals = () => {
    const escortDefs = [
      { id: 'escort_1', startHour: 7, startMinute: 0, endHour: 10, endMinute: 30 },
      { id: 'escort_2', startHour: 10, startMinute: 30, endHour: 14, endMinute: 0 },
      { id: 'escort_3', startHour: 14, startMinute: 0, endHour: 17, endMinute: 0 },
      { id: 'escort_4', startHour: 17, startMinute: 0, endHour: 19, endMinute: 0 },
    ];

    const build = (day, def) => {
      let s = dayjs(`${day}T${pad(def.startHour)}:${pad(def.startMinute)}:00`);
      let e = dayjs(`${day}T${pad(def.endHour)}:${pad(def.endMinute)}:00`);
      if (!e.isAfter(s)) e = e.add(1, 'day');
      // Clip to schedule boundaries
      if (s.isBefore(scheduleStart)) s = scheduleStart;
      if (e.isAfter(scheduleEnd)) e = scheduleEnd;
      if (!e.isAfter(s)) return null;
      return { start: s.toISOString(), end: e.toISOString() };
    };

    for (const a of existingKitchenAssignments || []) {
      const def = kitchenShiftDefsAll.find(d => d.id === a.shiftId);
      if (!def) continue;
      const times = build(a.day, def);
      if (!times) continue;
      addExtraInterval(Number(a.personId), times.start, times.end, 'kitchen');
    }
    for (const a of existingEscortAssignments || []) {
      const def = escortDefs.find(d => d.id === a.shiftId);
      if (!def) continue;
      const times = build(a.day, def);
      if (!times) continue;
      addExtraInterval(Number(a.personId), times.start, times.end, 'escort');
    }
  };

  const seedRasarIntervals = () => {
    const rasarDefs = [
      { id: 'rasar_1', startHour: 8, startMinute: 30, endHour: 11, endMinute: 30 },
      { id: 'rasar_2', startHour: 13, startMinute: 30, endHour: 17, endMinute: 30 },
      { id: 'rasar_3', startHour: 19, startMinute: 30, endHour: 20, endMinute: 30 },
    ];
    const build = (day, def) => {
      let s = dayjs(`${day}T${pad(def.startHour)}:${pad(def.startMinute)}:00`);
      let e = dayjs(`${day}T${pad(def.endHour)}:${pad(def.endMinute)}:00`);
      if (!e.isAfter(s)) e = e.add(1, 'day');
      return { start: s.toISOString(), end: e.toISOString() };
    };
    for (const a of existingRasarAssignments || []) {
      const def = rasarDefs.find(d => d.id === a.shiftId);
      if (!def) continue;
      const times = build(a.day, def);
      if (!times) continue;
      addExtraInterval(Number(a.personId), times.start, times.end, 'rasar');
    }
  };

  const seedEscort400Intervals = () => {
    const defs = [
      { id: 'escort400_1', startHour: 8, startMinute: 0, endHour: 12, endMinute: 30 },
      { id: 'escort400_2', startHour: 12, startMinute: 30, endHour: 17, endMinute: 0 },
    ];
    const build = (day, def) => {
      let s = dayjs(`${day}T${pad(def.startHour)}:${pad(def.startMinute)}:00`);
      let e = dayjs(`${day}T${pad(def.endHour)}:${pad(def.endMinute)}:00`);
      if (!e.isAfter(s)) e = e.add(1, 'day');
      return { start: s.toISOString(), end: e.toISOString() };
    };
    for (const a of existingEscort400Assignments || []) {
      const def = defs.find(d => d.id === a.shiftId);
      if (!def) continue;
      const times = build(a.day, def);
      if (!times) continue;
      addExtraInterval(Number(a.personId), times.start, times.end, 'escort400');
    }
  };

  seedKitchenEscortIntervals();
  seedRasarIntervals();
  seedEscort400Intervals();

  // Seed existing guard assignments into extraDutyIntervals so rasar/escort400 sees them for overlap checks
  const seedGuardIntervals = () => {
    for (const ea of existingAssignments || []) {
      if (ea.start && ea.end) {
        addExtraInterval(Number(ea.personId), ea.start, ea.end, 'guard');
      } else if (ea.day && ea.shiftLabel) {
        // Fallback: compute times directly from day + shiftLabel (don't rely on timeSlots which is date-range specific)
        const match = ea.shiftLabel.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
        if (match) {
          const startHour = parseInt(match[1], 10);
          const startMin = parseInt(match[2], 10);
          const endHour = parseInt(match[3], 10);
          const endMin = parseInt(match[4], 10);
          let start = dayjs(`${ea.day}T${pad(startHour)}:${pad(startMin)}:00`);
          let end = dayjs(`${ea.day}T${pad(endHour)}:${pad(endMin)}:00`);
          // Handle overnight shifts
          if (!end.isAfter(start)) end = end.add(1, 'day');
          addExtraInterval(Number(ea.personId), start.toISOString(), end.toISOString(), 'guard');
        }
      }
    }
  };
  seedGuardIntervals();

  // Seed existing BW assignments into extraDutyIntervals
  const seedBwIntervals = () => {
    const BW_SLOT_DEFS = [
      { id: 'bw_morning', startHour: 8, startMinute: 30, endHour: 11, endMinute: 30 },
      { id: 'bw_afternoon', startHour: 13, startMinute: 30, endHour: 17, endMinute: 30 },
      { id: 'bw_evening', startHour: 18, startMinute: 30, endHour: 20, endMinute: 0 },
    ];
    for (const bw of existingBwAssignments || []) {
      if (bw.start && bw.end) {
        addExtraInterval(Number(bw.personId), bw.start, bw.end, 'bw');
      } else if (bw.day && bw.slotId) {
        // Compute from day + slotId
        const def = BW_SLOT_DEFS.find(d => d.id === bw.slotId);
        if (def) {
          let start = dayjs(`${bw.day}T${pad(def.startHour)}:${pad(def.startMinute)}:00`);
          let end = dayjs(`${bw.day}T${pad(def.endHour)}:${pad(def.endMinute)}:00`);
          if (!end.isAfter(start)) end = end.add(1, 'day');
          addExtraInterval(Number(bw.personId), start.toISOString(), end.toISOString(), 'bw');
        }
      }
    }
  };
  seedBwIntervals();

  const canWork = (person, slot) => {
    const shiftKey = getShiftKey(slot.day, slot.shiftLabel);
    const assignedPeople = slotAssignments.get(shiftKey);
    if (assignedPeople?.has(person.id)) return false;
    if (violatesConstraint(person.id, slot.start, slot.end)) return false;

    if (hasRestViolation(person.id, slot.index)) return false;
    if (!canESMemberWorkAtShift(person.id, slot.day, slot.shiftLabel)) return false;
    if (person.standingExemption && standingExemptPostIds.has(slot.postId)) return false;
    if (person.nightGuardExemption && isNightShiftLabel(slot.shiftLabel)) return false;
    // Asthma exemption: can only work the lookout post (תצפיתן)
    if (person.asthmaExemption && slot.postName !== 'תצפיתן') return false;

    // Check for overlapping BW assignments
    if (hasOverlappingBWAssignment(person.id, slot.start, slot.end)) return false;

    // Check overlap with existing extra duties (kitchen/escort/rasar/escort400)
    if (overlapsWithExtraDuties(person.id, slot.start, slot.end)) return false;

    return true;
  };

  const violatesSameGenderPreference = (assignedPeople = [], candidate) => {
    // "Same gender only" applies to ALL shifts (day + night + partial).
    const all = [...(assignedPeople || []), candidate].filter(Boolean);
    const pref = all.filter(p => p?.sameGenderPref);
    if (pref.length === 0) return false;

    // If anyone in the group has the preference, everyone must share the same gender.
    const requiredGender = pref[0]?.gender;
    if (!requiredGender) return false;
    return all.some(p => p?.gender && p.gender !== requiredGender);
  };

  const tryAssignToSlot = (candidate, slot) => {
    if (slot.stillNeeded <= 0) return false;
    if (!canWork(candidate, slot)) return false;

    const slotKey = `${slot.postId}|${slot.day}|${slot.shiftLabel}`;
    const existingInSlot = existingBySlot.get(slotKey) || [];
    if (existingInSlot.includes(candidate.id)) return false;
    // Check same-gender preference (applies to all shifts)
    const assignedToThisPost = assignments.filter(a =>
      a.postId === slot.postId && a.day === slot.day && a.shiftLabel === slot.shiftLabel
    );

    if (assignedToThisPost.length > 0) {
      const assignedPeople = assignedToThisPost
        .map(a => people.find(p => p.id === a.personId))
        .filter(Boolean);
      if (violatesSameGenderPreference(assignedPeople, candidate)) return false;
    }

    // Duel guard: cannot be alone in the post slot
    if (candidate.duelGuard && assignedToThisPost.length === 0 && slot.stillNeeded <= 1) {
      return false;
    }

    // Assign this candidate to this slot
    assignments.push({
      postId: slot.postId,
      personId: candidate.id,
      shiftLabel: slot.shiftLabel,
      start: slot.start,
      end: slot.end,
      day: slot.day,
    });

    // Update tracking
    personShifts.get(candidate.id).push({
      start: slot.start,
      end: slot.end,
      day: slot.day,
      shiftLabel: slot.shiftLabel,
      index: slot.index,
    });
    shiftCountByPerson[candidate.id]++;
    slot.stillNeeded--;

    const shiftKey = getShiftKey(slot.day, slot.shiftLabel);
    if (!slotAssignments.has(shiftKey)) {
      slotAssignments.set(shiftKey, new Set());
    }
    slotAssignments.get(shiftKey).add(candidate.id);

    return true;
  };

  // Separate people into non-ES members and ES members
  const nonESMembers = people.filter(p => !personToESGroup.has(p.id));
  const esMembers = people.filter(p => personToESGroup.has(p.id));

  // Combined assignment loop - prioritize non-ES members but use ES when needed
  if (genGuards) {
    let madeProgress = true;
    while (madeProgress) {
      madeProgress = false;

      // Check if there are any unfilled slots
      const unfilledSlots = slotsToFill.filter(s => s.stillNeeded > 0);
      if (unfilledSlots.length === 0) break;

      // For each unfilled slot, try to find a candidate
      for (const slot of unfilledSlots) {
        // First, try non-ES members sorted by shift count
        const nonESCandidates = nonESMembers
          .filter(p => canWork(p, slot))
          .filter(p => {
            const slotKey = `${slot.postId}|${slot.day}|${slot.shiftLabel}`;
            const existingInSlot = existingBySlot.get(slotKey) || [];
            return !existingInSlot.includes(p.id);
          })
          .sort((a, b) => shiftCountByPerson[a.id] - shiftCountByPerson[b.id]);

        let assigned = false;
        for (const candidate of nonESCandidates) {
          if (tryAssignToSlot(candidate, slot)) {
            madeProgress = true;
            assigned = true;
            break;
          }
        }

        // If no non-ES member could be assigned, try ES members
        if (!assigned) {
          const esCandidates = esMembers
            .filter(p => canWork(p, slot))
            .filter(p => {
              const slotKey = `${slot.postId}|${slot.day}|${slot.shiftLabel}`;
              const existingInSlot = existingBySlot.get(slotKey) || [];
              return !existingInSlot.includes(p.id);
            })
            .sort((a, b) => shiftCountByPerson[a.id] - shiftCountByPerson[b.id]);

          for (const candidate of esCandidates) {
            if (tryAssignToSlot(candidate, slot)) {
              madeProgress = true;
              assigned = true;
              break;
            }
          }
        }
      }
    }
  }

  // Check for unfilled mandatory slots and calculate minimum people needed
  const unfilledMandatorySlots = slotsToFill.filter(slot => slot.stillNeeded > 0 && !slot.optional);

  if (unfilledMandatorySlots.length > 0) {
    // Calculate total unfilled positions
    const totalUnfilledPositions = unfilledMandatorySlots.reduce((sum, slot) => sum + slot.stillNeeded, 0);

    // Each person can work at most 2 shifts per day (due to 8-hour rest requirement)
    // So minimum additional people needed = ceil(totalUnfilledPositions / 2)
    const minPeopleNeeded = Math.ceil(totalUnfilledPositions / 2);

    return {
      assignments: [],
      bwAssignments: [],
      error: 'not enough manpower',
      missingCount: minPeopleNeeded
    };
  }

  // Check for duelGuard violations (duelGuard people alone in shifts)
  const assignmentsBySlot = new Map(); // `${postId}|${day}|${shiftLabel}` -> personIds[]
  for (const assignment of assignments) {
    const key = `${assignment.postId}|${assignment.day}|${assignment.shiftLabel}`;
    if (!assignmentsBySlot.has(key)) {
      assignmentsBySlot.set(key, []);
    }
    assignmentsBySlot.get(key).push(assignment.personId);
  }

  let duelGuardViolations = 0;
  let genderPrefViolations = 0;

  if (genGuards) {
    for (const [slotKey, personIds] of assignmentsBySlot.entries()) {
      if (personIds.length === 1) {
        const person = people.find(p => p.id === personIds[0]);
        if (person?.duelGuard) {
          // DuelGuard person is alone in a shift - need 1 more person
          duelGuardViolations += 1;
        }
      }

      // Check same-gender preference for ALL shifts
      if (personIds.length > 1) {
        const assignedPeople = personIds.map(pid => people.find(p => p.id === pid)).filter(Boolean);
        // If anyone has preference but the group is mixed-gender -> violation.
        const prefPeople = assignedPeople.filter(p => p?.sameGenderPref);
        if (prefPeople.length > 0) {
          const requiredGender = prefPeople[0]?.gender;
          if (requiredGender && assignedPeople.some(p => p?.gender && p.gender !== requiredGender)) {
            genderPrefViolations += 1;
          }
        }
      }
    }
  }

  if (duelGuardViolations > 0 || genderPrefViolations > 0) {
    return {
      assignments: [],
      bwAssignments: [],
      error: 'not enough manpower',
      missingCount: duelGuardViolations + genderPrefViolations
    };
  }

  const bwAssignments = [];
  const bwDays = genGuards ? computeBWDays(startISO, endISO, existingBwAssignments) : [];
  const bwSlotKey = (day, slotId) => `${day}|${slotId}`;
  const bwSlotAssignments = new Map(); // key -> Set of personIds

  const buildSlotTimes = (day, slot) => {
    let slotStart = dayjs(`${day}T${pad(slot.startHour)}:${pad(slot.startMinute)}:00`);
    let endDay = day;
    let endHour = slot.endHour;
    let endMinute = slot.endMinute;
    if (slot.endHour < slot.startHour || (slot.endHour === slot.startHour && slot.endMinute <= slot.startMinute)) {
      // crosses midnight
      endDay = dayjs(day).add(1, 'day').format('YYYY-MM-DD');
    }
    let slotEnd = dayjs(`${endDay}T${pad(endHour)}:${pad(endMinute)}:00`);

    // Clip to schedule boundaries
    if (slotStart.isBefore(scheduleStart)) {
      slotStart = scheduleStart;
    }
    if (slotEnd.isAfter(scheduleEnd)) {
      slotEnd = scheduleEnd;
    }

    if (!slotEnd.isAfter(slotStart)) {
      return null; // outside range; skip
    }

    return { start: slotStart.toISOString(), end: slotEnd.toISOString() };
  };

  // Seed with existing BW assignments
  for (const bw of existingBwAssignments) {
    const slot = BW_SLOTS.find(s => s.id === bw.slotId);
    if (!slot) continue;
    const key = bwSlotKey(bw.day, slot.id);
    if (!bwSlotAssignments.has(key)) {
      bwSlotAssignments.set(key, new Set());
    }
    bwSlotAssignments.get(key).add(Number(bw.personId));
    bwAssignmentCount[bw.personId] = (bwAssignmentCount[bw.personId] || 0) + 1;
    const times = buildSlotTimes(bw.day, slot);
    if (!times) continue; // outside range, skip
    bwAssignments.push({
      day: bw.day,
      slotId: slot.id,
      personId: Number(bw.personId),
      start: times.start,
      end: times.end,
    });
  }

  // Add BW intervals to extra-duty tracker
  for (const bw of bwAssignments) {
    addExtraInterval(Number(bw.personId), bw.start, bw.end, 'bw');
  }

  const overlapsWithShift = (personId, slotStartISO, slotEndISO) => {
    const shifts = personShifts.get(personId) || [];
    const slotStart = dayjs(slotStartISO);
    const slotEnd = dayjs(slotEndISO);
    for (const shift of shifts) {
      const shiftStart = dayjs(shift.start);
      const shiftEnd = dayjs(shift.end);
      // Exclude adjacent shifts (one ends when the other starts) - use minute precision
      if ((shiftEnd.isSame(slotStart, 'minute') || shiftEnd.isBefore(slotStart, 'minute')) ||
        (slotEnd.isSame(shiftStart, 'minute') || slotEnd.isBefore(shiftStart, 'minute'))) continue;
      if (shiftStart.isBefore(slotEnd) && slotStart.isBefore(shiftEnd)) {
        return true;
      }
    }
    return false;
  };

  const overlapsWithAnyDuty = (personId, slotStartISO, slotEndISO) =>
    overlapsWithShift(personId, slotStartISO, slotEndISO) || overlapsWithExtraDuties(personId, slotStartISO, slotEndISO);

  const canESMemberWorkBW = (personId, key) => {
    const groupId = personToESGroup.get(personId);
    if (!groupId) return true;
    const assigned = bwSlotAssignments.get(key) || new Set();
    for (const assignedId of assigned) {
      if (personToESGroup.get(assignedId) === groupId && assignedId !== personId) {
        return false;
      }
    }
    return true;
  };

  const esShiftOverlapExists = (groupId, slotStartISO, slotEndISO, excludePersonId) => {
    if (!groupId) return false;
    const slotStart = dayjs(slotStartISO);
    const slotEnd = dayjs(slotEndISO);
    for (const assignment of assignments) {
      if (assignment.personId === excludePersonId) continue;
      if (personToESGroup.get(assignment.personId) !== groupId) continue;
      const assignmentStart = dayjs(assignment.start);
      const assignmentEnd = dayjs(assignment.end);
      // Exclude adjacent shifts (one ends when the other starts) - use minute precision
      if ((assignmentEnd.isSame(slotStart, 'minute') || assignmentEnd.isBefore(slotStart, 'minute')) ||
        (slotEnd.isSame(assignmentStart, 'minute') || slotEnd.isBefore(assignmentStart, 'minute'))) continue;
      if (assignmentStart.isBefore(slotEnd) && slotStart.isBefore(assignmentEnd)) {
        return true;
      }
    }
    return false;
  };

  if (genGuards) {
    for (const day of bwDays) {
      for (const slot of BW_SLOTS) {
        const key = bwSlotKey(day, slot.id);
        if (!bwSlotAssignments.has(key)) {
          bwSlotAssignments.set(key, new Set());
        }
        const assignedSet = bwSlotAssignments.get(key);
        const stillNeeded = BW_REQUIRED - assignedSet.size;
        if (stillNeeded <= 0) continue;
        const times = buildSlotTimes(day, slot);
        if (!times) continue; // outside range
        const { start, end } = times;

        const candidates = [...people]
          .filter(person => !assignedSet.has(person.id))
          .filter(person => !violatesConstraint(person.id, start, end))
          .filter(person => !overlapsWithShift(person.id, start, end))
          .sort((a, b) => {
            const workA =
              shiftCountByPerson[a.id] +
              (bwAssignmentCount[a.id] || 0) +
              (kitchenAssignmentCount[a.id] || 0) +
              (escortAssignmentCount[a.id] || 0);
            const workB =
              shiftCountByPerson[b.id] +
              (bwAssignmentCount[b.id] || 0) +
              (kitchenAssignmentCount[b.id] || 0) +
              (escortAssignmentCount[b.id] || 0);
            return workA - workB;
          });

        for (const candidate of candidates) {
          if (assignedSet.size >= BW_REQUIRED) break;
          if (!canESMemberWorkBW(candidate.id, key)) continue;
          const candidateGroup = personToESGroup.get(candidate.id);
          if (esShiftOverlapExists(candidateGroup, start, end, candidate.id)) continue;
          assignedSet.add(candidate.id);
          bwAssignmentCount[candidate.id] = (bwAssignmentCount[candidate.id] || 0) + 1;
          bwAssignments.push({
            day,
            slotId: slot.id,
            personId: candidate.id,
            start,
            end,
          });
          addExtraInterval(candidate.id, start, end, 'bw');
        }
      }
    }
  }

  // ---- Kitchen Duty + Escort Duty ----
  const kitchenSettingsOut = { shifts: kitchenShiftList.map(s => ({ id: s.id, start: s.start, end: s.end, required: s.required })) };

  const escortRequiredShift1 = Number(escortSettings?.requiredShift1 ?? escortSettings?.requiredPerShift ?? 4);
  const escortRequiredShift2 = Number(escortSettings?.requiredShift2 ?? escortSettings?.requiredPerShift ?? 4);
  const escortRequiredShift3 = Number(escortSettings?.requiredShift3 ?? escortSettings?.requiredPerShift ?? 4);
  const escortRequiredShift4 = Number(escortSettings?.requiredShift4 ?? escortSettings?.requiredPerShift ?? 4);
  const escortSettingsOut = {
    requiredShift1: escortRequiredShift1,
    requiredShift2: escortRequiredShift2,
    requiredShift3: escortRequiredShift3,
    requiredShift4: escortRequiredShift4,
  };

  const kitchenShifts = kitchenShiftDefsAll;
  const kitchenRequiredById = new Map(kitchenShifts.map(s => [s.id, Math.max(0, Number(s.required ?? 36))]));

  const escortShifts = [
    { id: 'escort_1', startHour: 7, startMinute: 0, endHour: 10, endMinute: 30, label: '07:00-10:30' },
    { id: 'escort_2', startHour: 10, startMinute: 30, endHour: 14, endMinute: 0, label: '10:30-14:00' },
    { id: 'escort_3', startHour: 14, startMinute: 0, endHour: 17, endMinute: 0, label: '14:00-17:00' },
    { id: 'escort_4', startHour: 17, startMinute: 0, endHour: 19, endMinute: 0, label: '17:00-19:00' },
  ];

  const kitchenStartISO = options?.kitchenStartISO || startISO;
  const kitchenEndISO = options?.kitchenEndISO || endISO;
  const kitchenRangeStart = parseLocalDateTime(kitchenStartISO);
  const kitchenRangeEnd = parseLocalDateTime(kitchenEndISO);

  const buildDutySlotTimes = (day, def) => {
    let slotStart = dayjs(`${day}T${pad(def.startHour)}:${pad(def.startMinute)}:00`);
    let slotEnd = dayjs(`${day}T${pad(def.endHour)}:${pad(def.endMinute)}:00`);
    if (!slotEnd.isAfter(slotStart)) return null;

    // Clip to schedule boundaries
    if (slotStart.isBefore(kitchenRangeStart)) slotStart = kitchenRangeStart;
    if (slotEnd.isAfter(kitchenRangeEnd)) slotEnd = kitchenRangeEnd;
    if (!slotEnd.isAfter(slotStart)) return null;

    return { start: slotStart.toISOString(), end: slotEnd.toISOString() };
  };

  const dutyDaysForRange = (defs) => {
    const daysSet = new Set();
    let cursor = kitchenRangeStart.startOf('day');
    const lastDay = kitchenRangeEnd.startOf('day');
    while (cursor.isBefore(lastDay) || cursor.isSame(lastDay, 'day')) {
      const day = cursor.format('YYYY-MM-DD');
      const hasOverlap = defs.some(def => {
        const times = buildDutySlotTimes(day, def);
        return !!times;
      });
      if (hasOverlap) daysSet.add(day);
      cursor = cursor.add(1, 'day');
    }
    return Array.from(daysSet).sort();
  };

  const kitchenAssignments = [];
  const escortAssignments = [];

  const kitchenSlotAssigned = new Map(); // `${day}|${shiftId}` -> Set(personId)
  const escortSlotAssigned = new Map(); // `${day}|${shiftId}` -> Set(personId)

  const ensureSet = (map, key) => {
    if (!map.has(key)) map.set(key, new Set());
    return map.get(key);
  };

  const seedDutyAssignments = (existing, defs, slotMap, outArr, type) => {
    for (const a of existing || []) {
      const def = defs.find(d => d.id === a.shiftId);
      if (!def) continue;
      const times = buildDutySlotTimes(a.day, def);
      if (!times) continue;
      const key = `${a.day}|${def.id}`;
      const set = ensureSet(slotMap, key);
      const pid = Number(a.personId);
      if (set.has(pid)) continue;
      set.add(pid);
      outArr.push({ day: a.day, shiftId: def.id, personId: pid, start: times.start, end: times.end });
      addExtraInterval(pid, times.start, times.end, type);
      if (type === 'kitchen') kitchenAssignmentCount[pid] = (kitchenAssignmentCount[pid] || 0) + 1;
      if (type === 'escort') escortAssignmentCount[pid] = (escortAssignmentCount[pid] || 0) + 1;
    }
  };

  seedDutyAssignments(existingKitchenAssignments, kitchenShifts, kitchenSlotAssigned, kitchenAssignments, 'kitchen');
  seedDutyAssignments(existingEscortAssignments, escortShifts, escortSlotAssigned, escortAssignments, 'escort');

  // ---- RASAR Duty ("רס\"ר") ----
  // We seed existing assignments early so other duties (kitchen/escort) can avoid overlapping them.
  const rasarShifts = [
    { id: 'rasar_1', startHour: 8, startMinute: 30, endHour: 11, endMinute: 30, label: '08:30-11:30' },
    { id: 'rasar_2', startHour: 13, startMinute: 30, endHour: 17, endMinute: 30, label: '13:30-17:30' },
    { id: 'rasar_3', startHour: 19, startMinute: 30, endHour: 20, endMinute: 30, label: '19:30-20:30' },
  ];

  const rasarAssignments = [];
  const rasarSlotAssigned = new Map(); // `${day}|${shiftId}` -> Set(personId)

  const rasarRangeStart = parseLocalDateTime(rasarStartISO);
  const rasarRangeEnd = parseLocalDateTime(rasarEndISO);

  const buildRasarTimes = (day, def) => {
    let start = dayjs(`${day}T${pad(def.startHour)}:${pad(def.startMinute)}:00`);
    let end = dayjs(`${day}T${pad(def.endHour)}:${pad(def.endMinute)}:00`);
    if (!end.isAfter(start)) end = end.add(1, 'day');

    // Clip to provided rasar range (week)
    if (start.isBefore(rasarRangeStart)) start = rasarRangeStart;
    if (end.isAfter(rasarRangeEnd)) end = rasarRangeEnd;
    if (!end.isAfter(start)) return null;
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const ensureRasarSet = (key) => {
    if (!rasarSlotAssigned.has(key)) rasarSlotAssigned.set(key, new Set());
    return rasarSlotAssigned.get(key);
  };

  for (const a of existingRasarAssignments || []) {
    const def = rasarShifts.find(d => d.id === a.shiftId);
    if (!def) continue;
    const times = buildRasarTimes(a.day, def);
    if (!times) continue;
    const key = `${a.day}|${def.id}`;
    const set = ensureRasarSet(key);
    const pid = Number(a.personId);
    if (set.has(pid)) continue;
    set.add(pid);
    rasarAssignments.push({ day: a.day, shiftId: def.id, personId: pid, start: times.start, end: times.end });
    addExtraInterval(pid, times.start, times.end, 'rasar');
    rasarAssignmentCount[pid] = (rasarAssignmentCount[pid] || 0) + 1;
  }

  // ---- Contractor escort 400 ("ליווי קבלנים - 400") ----
  const escort400Shifts = [
    { id: 'escort400_1', startHour: 8, startMinute: 0, endHour: 12, endMinute: 30, label: '08:00-12:30' },
    { id: 'escort400_2', startHour: 12, startMinute: 30, endHour: 17, endMinute: 0, label: '12:30-17:00' },
  ];

  const escort400Assignments = [];
  const escort400SlotAssigned = new Map(); // `${day}|${shiftId}` -> Set(personId)
  const ensureEscort400Set = (key) => {
    if (!escort400SlotAssigned.has(key)) escort400SlotAssigned.set(key, new Set());
    return escort400SlotAssigned.get(key);
  };

  const buildEscort400Times = (day, def) => {
    let start = dayjs(`${day}T${pad(def.startHour)}:${pad(def.startMinute)}:00`);
    let end = dayjs(`${day}T${pad(def.endHour)}:${pad(def.endMinute)}:00`);
    if (!end.isAfter(start)) end = end.add(1, 'day');
    if (start.isBefore(rasarRangeStart)) start = rasarRangeStart;
    if (end.isAfter(rasarRangeEnd)) end = rasarRangeEnd;
    if (!end.isAfter(start)) return null;
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const isFemaleId = (pid) => {
    const person = people.find(p => Number(p.id) === Number(pid));
    return person?.gender === 'F';
  };

  for (const a of existingEscort400Assignments || []) {
    const def = escort400Shifts.find(d => d.id === a.shiftId);
    if (!def) continue;
    if (!isFemaleId(a.personId)) continue;
    const times = buildEscort400Times(a.day, def);
    if (!times) continue;
    const key = `${a.day}|${def.id}`;
    const set = ensureEscort400Set(key);
    const pid = Number(a.personId);
    if (set.has(pid)) continue;
    set.add(pid);
    escort400Assignments.push({ day: a.day, shiftId: def.id, personId: pid, start: times.start, end: times.end });
    addExtraInterval(pid, times.start, times.end, 'escort400');
    escort400AssignmentCount[pid] = (escort400AssignmentCount[pid] || 0) + 1;
  }

  const requiredForDuty = (type, shiftId) => {
    if (type === 'kitchen') {
      return Math.max(0, Number(kitchenRequiredById.get(shiftId) ?? 0));
    }
    if (type === 'escort') {
      if (shiftId === 'escort_1') return Math.max(0, escortRequiredShift1);
      if (shiftId === 'escort_2') return Math.max(0, escortRequiredShift2);
      if (shiftId === 'escort_3') return Math.max(0, escortRequiredShift3);
      if (shiftId === 'escort_4') return Math.max(0, escortRequiredShift4);
      return 0;
    }
    return 0;
  };

  const fillDuty = (defs, slotMap, outArr, type) => {
    const days = dutyDaysForRange(defs);
    for (const day of days) {
      for (const def of defs) {
        const times = buildDutySlotTimes(day, def);
        if (!times) continue;
        const key = `${day}|${def.id}`;
        const set = ensureSet(slotMap, key);
        const requiredPerShift = requiredForDuty(type, def.id);
        const stillNeeded = requiredPerShift - set.size;
        if (stillNeeded <= 0) continue;

        const candidates = [...people]
          .filter(p => !set.has(p.id))
          .filter(p => {
            if (type === 'kitchen' && p.kitchenExemption) return false;
            return true;
          })
          .filter(p => !violatesConstraint(p.id, times.start, times.end))
          .filter(p => !overlapsWithAnyDuty(p.id, times.start, times.end))
          .sort((a, b) => {
            const workA =
              (shiftCountByPerson[a.id] || 0) +
              (bwAssignmentCount[a.id] || 0) +
              (kitchenAssignmentCount[a.id] || 0) +
              (escortAssignmentCount[a.id] || 0);
            const workB =
              (shiftCountByPerson[b.id] || 0) +
              (bwAssignmentCount[b.id] || 0) +
              (kitchenAssignmentCount[b.id] || 0) +
              (escortAssignmentCount[b.id] || 0);
            return workA - workB;
          });

        for (const candidate of candidates) {
          if (set.size >= requiredPerShift) break;
          set.add(candidate.id);
          outArr.push({ day, shiftId: def.id, personId: candidate.id, start: times.start, end: times.end });
          addExtraInterval(candidate.id, times.start, times.end, type);
          if (type === 'kitchen') kitchenAssignmentCount[candidate.id] = (kitchenAssignmentCount[candidate.id] || 0) + 1;
          if (type === 'escort') escortAssignmentCount[candidate.id] = (escortAssignmentCount[candidate.id] || 0) + 1;
        }
      }
    }
  };

  if (genKitchenEscort) {
    // Fill escort first so `escort_2` (10:30-14:00) doesn't get starved by kitchen_2 (starts at 13:00)
    // which overlaps it and can otherwise consume most candidates.
    fillDuty(escortShifts, escortSlotAssigned, escortAssignments, 'escort');
    fillDuty(kitchenShifts, kitchenSlotAssigned, kitchenAssignments, 'kitchen');
  }

  const requiredForRasarShift = (day, shiftId) => {
    const o = rasarOverrides.find(x => x?.day === day && x?.shiftId === shiftId);
    const value = Number(o?.required ?? o?.requiredPerShift ?? 1);
    return Number.isFinite(value) ? Math.max(0, value) : 1;
  };

  const requiredForEscort400Shift = (day, shiftId) => {
    const o = escort400Overrides.find(x => x?.day === day && x?.shiftId === shiftId);
    const value = Number(o?.required ?? o?.requiredPerShift ?? 1);
    return Number.isFinite(value) ? Math.max(0, value) : 1;
  };

  // Extra guard-overlap safety: compute guard intervals directly from `existingAssignments` and
  // use this check in rasar/escort400 scheduling. This prevents edge cases where a guard duty
  // isn't correctly represented in the shared overlap trackers.
  const guardIntervalsByPerson = new Map(); // personId -> Array<{start,end}>
  for (const ea of existingAssignments || []) {
    const pid = Number(ea.personId);
    if (!pid) continue;
    let startISO = null;
    let endISO = null;

    // Prefer day+shiftLabel (matches UI labels; avoids any stale/incorrect timestamps)
    const m = (ea.shiftLabel || '').match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
    if (m && ea.day) {
      const sh = Number(m[1]);
      const sm = Number(m[2]);
      const eh = Number(m[3]);
      const em = Number(m[4]);
      const start = dayjs(`${ea.day}T${pad(sh)}:${pad(sm)}:00`);
      let end = dayjs(`${ea.day}T${pad(eh)}:${pad(em)}:00`);
      if (!end.isAfter(start)) end = end.add(1, 'day');
      startISO = start.toISOString();
      endISO = end.toISOString();
    } else if (ea.start && ea.end) {
      startISO = ea.start;
      endISO = ea.end;
    }
    if (!startISO || !endISO) continue;
    const arr = guardIntervalsByPerson.get(pid) || [];
    arr.push({ start: startISO, end: endISO });
    guardIntervalsByPerson.set(pid, arr);
  }
  const overlapsWithGuards = (personId, slotStartISO, slotEndISO) => {
    const list = guardIntervalsByPerson.get(Number(personId)) || [];
    for (const g of list) {
      if (overlapsIso(g.start, g.end, slotStartISO, slotEndISO)) return true;
    }
    return false;
  };

  // Hard "can assign" check for rasar/escort400:
  // Before assigning a person, scan ALL their duties + constraints and ensure no overlap.
  // This is the ground truth (no reliance on internal trackers).
  const buildBwInterval = (bw) => {
    const def = (BW_SLOTS || []).find(s => s.id === bw.slotId);
    if (!def) return null;
    const start = dayjs(`${bw.day}T${pad(def.startHour)}:${pad(def.startMinute)}:00`);
    let end = dayjs(`${bw.day}T${pad(def.endHour)}:${pad(def.endMinute)}:00`);
    if (!end.isAfter(start)) end = end.add(1, 'day');
    return { start: start.toISOString(), end: end.toISOString() };
  };
  const buildKitchenInterval = (k) => {
    const def = kitchenShiftDefsAll.find(d => d.id === k.shiftId);
    if (!def) return null;
    const start = dayjs(`${k.day}T${pad(def.startHour)}:${pad(def.startMinute)}:00`);
    let end = dayjs(`${k.day}T${pad(def.endHour)}:${pad(def.endMinute)}:00`);
    if (!end.isAfter(start)) end = end.add(1, 'day');
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const escortDefs = [
    { id: 'escort_1', startHour: 7, startMinute: 0, endHour: 10, endMinute: 30 },
    { id: 'escort_2', startHour: 10, startMinute: 30, endHour: 14, endMinute: 0 },
    { id: 'escort_3', startHour: 14, startMinute: 0, endHour: 17, endMinute: 0 },
    { id: 'escort_4', startHour: 17, startMinute: 0, endHour: 19, endMinute: 0 },
  ];
  const buildEscortInterval = (e0) => {
    const def = escortDefs.find(d => d.id === e0.shiftId);
    if (!def) return null;
    const start = dayjs(`${e0.day}T${pad(def.startHour)}:${pad(def.startMinute)}:00`);
    let end = dayjs(`${e0.day}T${pad(def.endHour)}:${pad(def.endMinute)}:00`);
    if (!end.isAfter(start)) end = end.add(1, 'day');
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const canAssignRasarLike = (personId, slotStartISO, slotEndISO) => {
    const pid = Number(personId);
    if (!pid) return false;

    // Constraints
    if (violatesConstraint(pid, slotStartISO, slotEndISO)) return false;

    // Guards
    if (overlapsWithGuards(pid, slotStartISO, slotEndISO)) return false;

    // BW
    for (const bw of existingBwAssignments || []) {
      if (Number(bw.personId) !== pid) continue;
      const interval = buildBwInterval(bw);
      if (interval && overlapsIso(interval.start, interval.end, slotStartISO, slotEndISO)) return false;
    }

    // Kitchen
    for (const k of existingKitchenAssignments || []) {
      if (Number(k.personId) !== pid) continue;
      const interval = buildKitchenInterval(k);
      if (interval && overlapsIso(interval.start, interval.end, slotStartISO, slotEndISO)) return false;
    }

    // Escort
    for (const e0 of existingEscortAssignments || []) {
      if (Number(e0.personId) !== pid) continue;
      const interval = buildEscortInterval(e0);
      if (interval && overlapsIso(interval.start, interval.end, slotStartISO, slotEndISO)) return false;
    }

    // Existing rasar/400 from previous state
    for (const r0 of existingRasarAssignments || []) {
      if (Number(r0.personId) !== pid) continue;
      const def = rasarShifts.find(d => d.id === r0.shiftId);
      if (!def) continue;
      const times = buildRasarTimes(r0.day, def);
      if (times && overlapsIso(times.start, times.end, slotStartISO, slotEndISO)) return false;
    }
    for (const e400 of existingEscort400Assignments || []) {
      if (Number(e400.personId) !== pid) continue;
      const def = escort400Shifts.find(d => d.id === e400.shiftId);
      if (!def) continue;
      const times = buildEscort400Times(e400.day, def);
      if (times && overlapsIso(times.start, times.end, slotStartISO, slotEndISO)) return false;
    }

    // Already assigned in this generation (tracked in extraDutyIntervals by addExtraInterval)
    if (overlapsWithExtraDuties(pid, slotStartISO, slotEndISO)) return false;

    return true;
  };

  const rasarWeekDays = () => {
    const out = [];
    // Sun..Thu only
    const base = rasarRangeStart.startOf('day');
    for (let i = 0; i < 5; i += 1) {
      const day = base.add(i, 'day').format('YYYY-MM-DD');
      // Only include if overlaps the provided range
      if (dayjs(day).isBefore(rasarRangeStart.startOf('day')) || dayjs(day).isAfter(rasarRangeEnd.startOf('day'))) continue;
      out.push(day);
    }
    return out;
  };

  if (genRasar) {
    for (const day of rasarWeekDays()) {
      for (const def of rasarShifts) {
        const times = buildRasarTimes(day, def);
        if (!times) continue;
        const key = `${day}|${def.id}`;
        const set = ensureRasarSet(key);
        const requiredPerShift = requiredForRasarShift(day, def.id);
        const stillNeeded = requiredPerShift - set.size;
        if (stillNeeded <= 0) continue;

        const candidates = [...people]
          // ES (כ"כ) members should NOT be assigned to rasar at all
          .filter(p => !personToESGroup.has(p.id))
          .filter(p => !set.has(p.id))
          .filter(p => canAssignRasarLike(p.id, times.start, times.end))
          .sort((a, b) => {
            const workA =
              (shiftCountByPerson[a.id] || 0) +
              (bwAssignmentCount[a.id] || 0) +
              (kitchenAssignmentCount[a.id] || 0) +
              (escortAssignmentCount[a.id] || 0) +
              (rasarAssignmentCount[a.id] || 0);
            const workB =
              (shiftCountByPerson[b.id] || 0) +
              (bwAssignmentCount[b.id] || 0) +
              (kitchenAssignmentCount[b.id] || 0) +
              (escortAssignmentCount[b.id] || 0) +
              (rasarAssignmentCount[b.id] || 0);
            const diff = workA - workB;
            if (diff !== 0) return diff;
            return tieBreakRandom(a, b);
          });

        for (const candidate of candidates) {
          if (set.size >= requiredPerShift) break;
          if (!canAssignRasarLike(candidate.id, times.start, times.end)) continue;
          set.add(candidate.id);
          rasarAssignments.push({ day, shiftId: def.id, personId: candidate.id, start: times.start, end: times.end });
          addExtraInterval(candidate.id, times.start, times.end, 'rasar');
          rasarAssignmentCount[candidate.id] = (rasarAssignmentCount[candidate.id] || 0) + 1;
        }
      }
    }
  }

  if (genRasar) {
    for (const day of rasarWeekDays()) {
      for (const def of escort400Shifts) {
        const times = buildEscort400Times(day, def);
        if (!times) continue;
        const key = `${day}|${def.id}`;
        const set = ensureEscort400Set(key);
        const requiredPerShift = requiredForEscort400Shift(day, def.id);
        const stillNeeded = requiredPerShift - set.size;
        if (stillNeeded <= 0) continue;

        const candidates = [...people]
          .filter(p => p.gender === 'F')
          // ES (כ"כ) members should NOT be assigned to escort400 at all
          .filter(p => !personToESGroup.has(p.id))
          .filter(p => !set.has(p.id))
          .filter(p => canAssignRasarLike(p.id, times.start, times.end))
          .sort((a, b) => {
            const workA =
              (shiftCountByPerson[a.id] || 0) +
              (bwAssignmentCount[a.id] || 0) +
              (kitchenAssignmentCount[a.id] || 0) +
              (escortAssignmentCount[a.id] || 0) +
              (rasarAssignmentCount[a.id] || 0) +
              (escort400AssignmentCount[a.id] || 0);
            const workB =
              (shiftCountByPerson[b.id] || 0) +
              (bwAssignmentCount[b.id] || 0) +
              (kitchenAssignmentCount[b.id] || 0) +
              (escortAssignmentCount[b.id] || 0) +
              (rasarAssignmentCount[b.id] || 0) +
              (escort400AssignmentCount[b.id] || 0);
            const diff = workA - workB;
            if (diff !== 0) return diff;
            return tieBreakRandom(a, b);
          });

        for (const candidate of candidates) {
          if (set.size >= requiredPerShift) break;
          if (!canAssignRasarLike(candidate.id, times.start, times.end)) continue;
          set.add(candidate.id);
          escort400Assignments.push({ day, shiftId: def.id, personId: candidate.id, start: times.start, end: times.end });
          addExtraInterval(candidate.id, times.start, times.end, 'escort400');
          escort400AssignmentCount[candidate.id] = (escort400AssignmentCount[candidate.id] || 0) + 1;
        }
      }
    }
  }

  return {
    assignments,
    bwAssignments,
    kitchenAssignments,
    escortAssignments,
    rasarAssignments,
    escort400Assignments,
    kitchenSettings: kitchenSettingsOut,
    escortSettings: escortSettingsOut,
  };
};
