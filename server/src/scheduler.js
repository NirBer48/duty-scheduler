import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

export const scheduleGenerator = (
  people,
  posts,
  startISO,
  endISO,
  shiftOverrides = [],
  esAssignments = [],
  existingAssignments = []
) => {
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
  people.forEach(p => {
    personShifts.set(p.id, []);
    shiftCountByPerson[p.id] = 0;
  });

  // Build list of all shift time slots in the date range
  const timeSlots = [];
  
  let curr = dayjs(startISO);
  const startHour = curr.hour();
  const roundedHour = Math.floor(startHour / 4) * 4;
  curr = curr.hour(roundedHour).minute(0).second(0).millisecond(0);
  
  const endDt = dayjs(endISO);

  while (curr.isBefore(endDt)) {
    const h = curr.hour();
    const sh = shiftDefinitions.find(s => s.startOffset === h);
    if (sh) {
      const year = curr.year();
      const month = String(curr.month() + 1).padStart(2, '0');
      const date = String(curr.date()).padStart(2, '0');
      const day = `${year}-${month}-${date}`;
      
      const shiftStart = curr.toISOString();
      const shiftEndDt = curr.add(4, 'hour');
      const shiftEnd = shiftEndDt.toISOString();
      
      timeSlots.push({
        day,
        shiftLabel: sh.label,
        start: shiftStart,
        end: shiftEnd,
        index: timeSlots.length,
      });
    }
    curr = curr.add(4, 'hour');
  }

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
    const tsIdx = timeSlotIndex.get(tsKey);
    
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

  const isExempt = (person, slot) => {
    if (!person.exemptions) return false;
    if (person.exemptions.includes(String(slot.postId))) return true;
    if (person.exemptions.includes(`${slot.postId}|${slot.day}`)) return true;
    return false;
  };

  const canWork = (person, slot) => {
    const shiftKey = getShiftKey(slot.day, slot.shiftLabel);
    const assignedPeople = slotAssignments.get(shiftKey);
    if (assignedPeople?.has(person.id)) return false;

    if (hasRestViolation(person.id, slot.index)) return false;
    if (isExempt(person, slot)) return false;
    if (!canESMemberWorkAtShift(person.id, slot.day, slot.shiftLabel)) return false;
    return true;
  };

  const canPair = (p1, p2) => {
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
      if (firstPerson && !canPair(firstPerson, candidate)) return false;
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

  // Check for unfilled mandatory slots
  const unfilledMandatory = slotsToFill.some(slot => slot.stillNeeded > 0 && !slot.optional);
  
  if (unfilledMandatory) {
    return { assignments: [], error: 'not enough manpower' };
  }

  return { assignments };
};
