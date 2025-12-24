import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

// Configuration constants - can be overridden by environment variables
const STANDING_EXEMPT_POST_NAMES = process.env.STANDING_EXEMPT_POST_NAMES
  ? JSON.parse(process.env.STANDING_EXEMPT_POST_NAMES)
  : ["שג רגלי","ימח","שג רכוב אחורי","שג רכוב קדמי","עתודה"];

const BW_SLOTS = [
  { id: 'bw_morning', label: 'BW 08:30-11:30', startHour: 8, startMinute: 30, endHour: 11, endMinute: 30 },
  { id: 'bw_afternoon', label: 'BW 13:30-17:30', startHour: 13, startMinute: 30, endHour: 17, endMinute: 30 },
  { id: 'bw_evening', label: 'BW 18:30-20:00', startHour: 18, startMinute: 30, endHour: 20, endMinute: 0 },
];

const BW_REQUIRED = parseInt(process.env.BW_REQUIRED) || 20;
const NIGHT_SHIFT_LABELS = new Set(['20:00-00:00', '00:00-04:00', '04:00-08:00']); // posts people with standing exemption cannot occupy

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
  const mode = options?.mode || 'all'; // 'all' | 'guards' | 'kitchen'
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
  people.forEach(p => {
    personShifts.set(p.id, []);
    shiftCountByPerson[p.id] = 0;
    bwAssignmentCount[p.id] = 0;
    kitchenAssignmentCount[p.id] = 0;
    escortAssignmentCount[p.id] = 0;
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

  // Build list of all shift time slots in the date range
  const timeSlots = [];
  
  // Parse as local time (not UTC): extract YYYY-MM-DDTHH:mm and rebuild as local
  // Treat incoming strings as local times (no TZ shift)
  const parseLocalDateTime = (isoString) => dayjs(isoString);
  
  const startDt = parseLocalDateTime(startISO).second(0).millisecond(0);
  const endDt = parseLocalDateTime(endISO).second(0).millisecond(0);

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
  if (mode !== 'kitchen') {
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

  const canWork = (person, slot) => {
    const shiftKey = getShiftKey(slot.day, slot.shiftLabel);
    const assignedPeople = slotAssignments.get(shiftKey);
    if (assignedPeople?.has(person.id)) return false;

    const cList = constraintsByPerson.get(person.id) || [];
    if (cList.length > 0) {
      const slotStart = dayjs(slot.start);
      const slotEnd = dayjs(slot.end);
      for (const c of cList) {
        if (slotStart.isBefore(c.end) && c.start.isBefore(slotEnd)) {
          return false;
        }
      }
    }

    if (hasRestViolation(person.id, slot.index)) return false;
    if (!canESMemberWorkAtShift(person.id, slot.day, slot.shiftLabel)) return false;
    if (person.standingExemption && standingExemptPostIds.has(slot.postId)) return false;
    
    // Check for overlapping BW assignments
    if (hasOverlappingBWAssignment(person.id, slot.start, slot.end)) return false;
    
    return true;
  };

  const canPair = (p1, p2, shiftLabel) => {
    if (!NIGHT_SHIFT_LABELS.has(shiftLabel)) return true;
    if (p1.sameGenderPref || p2.sameGenderPref) {
      return p1.gender === p2.gender;
    }
    return true;
  };

  const tryAssignToSlot = (candidate, slot) => {
    if (slot.stillNeeded <= 0) return false;
    if (!canWork(candidate, slot)) return false;
    
    const slotKey = `${slot.postId}|${slot.day}|${slot.shiftLabel}`;
    const existingInSlot = existingBySlot.get(slotKey) || [];
    if (existingInSlot.includes(candidate.id)) return false;
    
    // Check same-gender pairing if needed
    const assignedToThisPost = assignments.filter(a => 
      a.postId === slot.postId && a.day === slot.day && a.shiftLabel === slot.shiftLabel
    );
    
    if (assignedToThisPost.length > 0) {
      const firstPerson = people.find(p => p.id === assignedToThisPost[0].personId);
      if (firstPerson && !canPair(firstPerson, candidate, slot.shiftLabel)) return false;
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
  if (mode !== 'kitchen') {
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

  // Check for unfilled mandatory slots
  const unfilledMandatory = mode !== 'kitchen' && slotsToFill.some(slot => slot.stillNeeded > 0 && !slot.optional);
  
  if (unfilledMandatory) {
    return { assignments: [], bwAssignments: [], error: 'not enough manpower' };
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

  if (mode !== 'kitchen') {
    for (const [slotKey, personIds] of assignmentsBySlot.entries()) {
      if (personIds.length === 1) {
        const person = people.find(p => p.id === personIds[0]);
        if (person?.duelGuard) {
          // DuelGuard person is alone in a shift
          return { assignments: [], bwAssignments: [], error: 'not enough manpower' };
        }
      }

      // Check same-gender preference for night shifts
      if (personIds.length > 1) {
        const [postId, day, shiftLabel] = slotKey.split('|');
        if (NIGHT_SHIFT_LABELS.has(shiftLabel)) {
          const assignedPeople = personIds.map(pid => people.find(p => p.id === pid)).filter(Boolean);
          for (let i = 0; i < assignedPeople.length; i++) {
            const person = assignedPeople[i];
            if (person.sameGenderPref) {
              for (let j = 0; j < assignedPeople.length; j++) {
                if (i !== j && assignedPeople[j].gender !== person.gender) {
                  // Same-gender preference violated
                  return { assignments: [], bwAssignments: [], error: 'not enough manpower' };
                }
              }
            }
          }
        }
      }
    }
  }

  const bwAssignments = [];
  const bwDays = mode === 'kitchen' ? [] : computeBWDays(startISO, endISO, existingBwAssignments);
  const bwSlotKey = (day, slotId) => `${day}|${slotId}`;
  const bwSlotAssignments = new Map(); // key -> Set of personIds

  const pad = value => String(value).padStart(2, '0');
  const scheduleStart = parseLocalDateTime(startISO);
  const scheduleEnd = parseLocalDateTime(endISO);
  
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

  // Track non-guard duty intervals per person for overlap checks (BW + kitchen + escort)
  const extraDutyIntervals = new Map(); // personId -> [{start,end,type}]
  const addExtraInterval = (personId, start, end, type) => {
    if (!extraDutyIntervals.has(personId)) extraDutyIntervals.set(personId, []);
    extraDutyIntervals.get(personId).push({ start, end, type });
  };
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
      if (shiftStart.isBefore(slotEnd) && slotStart.isBefore(shiftEnd)) {
        return true;
      }
    }
    return false;
  };

  const overlapsWithExtraDuties = (personId, slotStartISO, slotEndISO) => {
    const list = extraDutyIntervals.get(personId) || [];
    const slotStart = dayjs(slotStartISO);
    const slotEnd = dayjs(slotEndISO);
    for (const interval of list) {
      const aStart = dayjs(interval.start);
      const aEnd = dayjs(interval.end);
      if (aStart.isBefore(slotEnd) && slotStart.isBefore(aEnd)) return true;
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
      if (assignmentStart.isBefore(slotEnd) && slotStart.isBefore(assignmentEnd)) {
        return true;
      }
    }
    return false;
  };

  if (mode !== 'kitchen') {
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
  const parseHHmm = (value, fallback) => {
    const str = (value || fallback || '').toString();
    const m = str.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return { hour: 13, minute: 0, str: '13:00' };
    let hour = Number(m[1]);
    let minute = Number(m[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return { hour: 13, minute: 0, str: '13:00' };
    hour = Math.min(23, Math.max(0, hour));
    minute = Math.min(59, Math.max(0, minute));
    const out = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return { hour, minute, str: out };
  };

  const kitchenShift2Start = parseHHmm(kitchenSettings?.shift2Start, '13:00');
  const kitchenRequiredShift1 = Number(kitchenSettings?.requiredShift1 ?? kitchenSettings?.requiredPerShift ?? 36);
  const kitchenRequiredShift2 = Number(kitchenSettings?.requiredShift2 ?? kitchenSettings?.requiredPerShift ?? 36);
  const kitchenSettingsOut = { requiredShift1: kitchenRequiredShift1, requiredShift2: kitchenRequiredShift2, shift2Start: kitchenShift2Start.str };

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

  const kitchenShifts = [
    { id: 'kitchen_1', startHour: 6, startMinute: 0, endHour: kitchenShift2Start.hour, endMinute: kitchenShift2Start.minute, label: `06:00-${kitchenShift2Start.str}` },
    { id: 'kitchen_2', startHour: kitchenShift2Start.hour, startMinute: kitchenShift2Start.minute, endHour: 21, endMinute: 0, label: `${kitchenShift2Start.str}-21:00` },
  ].filter(s => (s.startHour * 60 + s.startMinute) < (s.endHour * 60 + s.endMinute)); // ignore invalid split

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

  const violatesConstraint = (personId, slotStartISO, slotEndISO) => {
    const cList = constraintsByPerson.get(personId) || [];
    if (cList.length === 0) return false;
    const slotStart = dayjs(slotStartISO);
    const slotEnd = dayjs(slotEndISO);
    for (const c of cList) {
      if (slotStart.isBefore(c.end) && c.start.isBefore(slotEnd)) return true;
    }
    return false;
  };

  const requiredForDuty = (type, shiftId) => {
    if (type === 'kitchen') {
      if (shiftId === 'kitchen_1') return Math.max(0, kitchenRequiredShift1);
      if (shiftId === 'kitchen_2') return Math.max(0, kitchenRequiredShift2);
      return 0;
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

  if (mode !== 'guards') {
    fillDuty(kitchenShifts, kitchenSlotAssigned, kitchenAssignments, 'kitchen');
    fillDuty(escortShifts, escortSlotAssigned, escortAssignments, 'escort');
  }

  return {
    assignments,
    bwAssignments,
    kitchenAssignments,
    escortAssignments,
    kitchenSettings: kitchenSettingsOut,
    escortSettings: escortSettingsOut,
  };
};
