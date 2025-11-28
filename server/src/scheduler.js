import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

export function scheduleGenerator(people, posts, startISO, endISO, shiftOverrides = []) {
  // Build all 4-hour shift time slots between start and end
  const shiftDefinitions = [
    { label: '00:00-04:00', startOffset: 0, endOffset: 4 },
    { label: '04:00-08:00', startOffset: 4, endOffset: 8 },
    { label: '08:00-12:00', startOffset: 8, endOffset: 12 },
    { label: '12:00-16:00', startOffset: 12, endOffset: 16 },
    { label: '16:00-20:00', startOffset: 16, endOffset: 20 },
    { label: '20:00-00:00', startOffset: 20, endOffset: 24 },
  ];

  // Helper to get required count for a specific post/day/shift (with overrides)
  function getRequiredCount(postId, day, shiftLabel, defaultRequired) {
    const override = shiftOverrides.find(o => 
      o.postId === postId && o.day === day && o.shiftLabel === shiftLabel
    );
    return override ? override.requiredPerShift : defaultRequired;
  }

  // Track per-person: last shift end time and total shift count
  const lastEndByPerson = {};
  const shiftCountByPerson = {};
  people.forEach(p => {
    lastEndByPerson[p.id] = null;
    shiftCountByPerson[p.id] = 0;
  });

  // Build list of all shift time slots in the date range
  const timeSlots = [];
  
  // Parse start and end, work in local time
  let curr = dayjs(startISO);
  // Round down to nearest 4-hour boundary
  const startHour = curr.hour();
  const roundedHour = Math.floor(startHour / 4) * 4;
  curr = curr.hour(roundedHour).minute(0).second(0).millisecond(0);
  
  const endDt = dayjs(endISO);

  while (curr.isBefore(endDt)) {
    const h = curr.hour();
    const sh = shiftDefinitions.find(s => s.startOffset === h);
    if (sh) {
      // Get the date part directly from the current datetime (local time)
      // For 00:00-04:00, the day should be the date when the shift STARTS
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
      });
    }
    curr = curr.add(4, 'hour');
  }

  // For each time slot, for each post, create ONE entry to fill
  const slotsToFill = [];
  for (const ts of timeSlots) {
    for (const post of posts) {
      // Get required count, checking for overrides
      const required = getRequiredCount(post.id, ts.day, ts.shiftLabel, post.requiredPerShift);
      slotsToFill.push({
        day: ts.day,
        shiftLabel: ts.shiftLabel,
        start: ts.start,
        end: ts.end,
        postId: post.id,
        postName: post.name,
        required: required,
        optional: !!post.optional || required === 0, // Treat 0-required as optional
      });
    }
  }

  // Sort: process by time first, then mandatory posts before optional
  slotsToFill.sort((a, b) => {
    const timeCompare = a.start.localeCompare(b.start);
    if (timeCompare !== 0) return timeCompare;
    return a.optional - b.optional;
  });

  const assignments = [];
  let unfilledMandatory = false;

  // Constraint helpers
  function isExempt(person, slot) {
    if (!person.exemptions) return false;
    if (person.exemptions.includes(String(slot.postId))) return true;
    if (person.exemptions.includes(`${slot.postId}|${slot.day}`)) return true;
    return false;
  }

  function canWork(person, slot) {
    // Check 8-hour rest rule
    if (lastEndByPerson[person.id]) {
      const lastEnd = dayjs(lastEndByPerson[person.id]);
      const currStart = dayjs(slot.start);
      const hoursDiff = currStart.diff(lastEnd, 'hour', true);
      if (hoursDiff < 8) {
        return false;
      }
    }
    // Check exemptions
    if (isExempt(person, slot)) return false;
    return true;
  }

  function canPair(p1, p2) {
    // Same gender preference check for pairing
    if (p1.sameGenderPref || p2.sameGenderPref) {
      return p1.gender === p2.gender;
    }
    return true;
  }

  // For each slot, assign exactly `required` people
  for (const slot of slotsToFill) {
    const needed = slot.required;
    const assigned = [];

    // Get eligible candidates sorted by least shifts (equal distribution)
    let candidates = people
      .filter(p => canWork(p, slot))
      .sort((a, b) => shiftCountByPerson[a.id] - shiftCountByPerson[b.id]);

    // Assign exactly `needed` people
    for (let i = 0; i < needed && i < candidates.length; i++) {
      // For pairs with same-gender preference, check compatibility
      if (needed === 2 && assigned.length === 1) {
        // Find a compatible second person
        const first = assigned[0];
        let foundCompatible = false;
        for (let j = i; j < candidates.length; j++) {
          if (canPair(first, candidates[j])) {
            assigned.push(candidates[j]);
            foundCompatible = true;
            break;
          }
        }
        if (!foundCompatible && candidates[i]) {
          assigned.push(candidates[i]);
        }
      } else {
        assigned.push(candidates[i]);
      }
    }

    // Check if we filled the slot
    if (assigned.length < needed && !slot.optional) {
      unfilledMandatory = true;
    }

    // Record assignments and update tracking
    for (const person of assigned) {
      assignments.push({
        postId: slot.postId,
        personId: person.id,
        shiftLabel: slot.shiftLabel,
        start: slot.start,
        end: slot.end,
        day: slot.day,
      });
      lastEndByPerson[person.id] = slot.end;
      shiftCountByPerson[person.id]++;
    }
  }

  if (unfilledMandatory) {
    return { assignments: [], error: 'not enough manpower' };
  }

  return { assignments };
}
