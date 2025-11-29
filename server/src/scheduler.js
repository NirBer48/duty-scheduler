import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

/**
 * @param {Array} people - List of people
 * @param {Array} posts - List of posts
 * @param {string} startISO - Start date/time
 * @param {string} endISO - End date/time
 * @param {Array} shiftOverrides - Override requirements for specific shifts
 * @param {Array} esAssignments - ES group assignments [{ groupId: 'es1'|'es2', personIds: number[] }]
 */
export function scheduleGenerator(people, posts, startISO, endISO, shiftOverrides = [], esAssignments = []) {
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

  // Build ES group membership map: personId -> groupId
  // Ensure personIds are numbers for consistent lookup
  const personToESGroup = new Map();
  console.log('Building ES group map from:', JSON.stringify(esAssignments));
  for (const es of esAssignments) {
    for (const personId of es.personIds) {
      const numericId = Number(personId);
      personToESGroup.set(numericId, es.groupId);
      console.log(`  Person ${numericId} (type: ${typeof numericId}) -> ES group ${es.groupId}`);
    }
  }
  console.log('ES group map size:', personToESGroup.size);
  console.log('People IDs:', people.map(p => `${p.id} (${typeof p.id})`).join(', '));

  // Track ES group members working at each shift: `${day}|${shiftLabel}` -> Set of groupIds that have someone working
  const esGroupWorkingAtShift = new Map();

  // Helper to get the shift key
  function getShiftKey(day, shiftLabel) {
    return `${day}|${shiftLabel}`;
  }

  // Helper to check if an ES group member can work at a shift
  function canESMemberWork(personId, day, shiftLabel) {
    const groupId = personToESGroup.get(personId);
    if (!groupId) return true; // Not in an ES group, no restriction
    
    const shiftKey = getShiftKey(day, shiftLabel);
    const workingGroups = esGroupWorkingAtShift.get(shiftKey);
    
    if (!workingGroups) return true; // No one from any ES group working yet
    
    // Check if someone from this person's ES group is already working
    const canWork = !workingGroups.has(groupId);

    return canWork;
  }

  // Helper to mark an ES group member as working at a shift
  function markESMemberWorking(personId, day, shiftLabel) {
    const groupId = personToESGroup.get(personId);
    if (!groupId) return; // Not in an ES group
    
    const shiftKey = getShiftKey(day, shiftLabel);
    if (!esGroupWorkingAtShift.has(shiftKey)) {
      esGroupWorkingAtShift.set(shiftKey, new Set());
    }
    esGroupWorkingAtShift.get(shiftKey).add(groupId);
    console.log(`ES MARK: Person ${personId} (${groupId}) marked as working at ${shiftKey}`);
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
    
    // Check ES group constraint - only 1 person from each ES group per shift
    if (!canESMemberWork(person.id, slot.day, slot.shiftLabel)) {
      return false;
    }
    
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
    
    // Track ES groups already assigned in THIS slot (for same-slot multi-person assignments)
    const esGroupsInThisSlot = new Set();
    
    // Helper to check if person can be assigned to this specific slot
    // considering both global ES tracking AND local slot tracking
    function canAssignToThisSlot(personId) {
      const groupId = personToESGroup.get(personId);
      if (!groupId) return true; // Not in ES group
      
      // Check if this ES group already has someone in this slot
      if (esGroupsInThisSlot.has(groupId)) return false;
      
      // Also check global tracking (for cross-post same-shift assignments)
      return canESMemberWork(personId, slot.day, slot.shiftLabel);
    }
    
    // Helper to mark person as assigned to this slot
    function markAssignedToSlot(personId) {
      const groupId = personToESGroup.get(personId);
      if (groupId) {
        esGroupsInThisSlot.add(groupId);
      }
    }

    // Get eligible candidates sorted by least shifts (equal distribution)
    let candidates = people
      .filter(p => canWork(p, slot))
      .sort((a, b) => shiftCountByPerson[a.id] - shiftCountByPerson[b.id]);

    // Assign exactly `needed` people
    for (let i = 0; i < needed; i++) {
      // Find next eligible candidate
      let foundCandidate = null;
      
      for (const candidate of candidates) {
        // Skip if already assigned to this slot
        if (assigned.some(a => a.id === candidate.id)) continue;
        
        // Check ES group constraint for this slot
        if (!canAssignToThisSlot(candidate.id)) continue;
        
        // For pairs with same-gender preference, check compatibility
        if (assigned.length > 0) {
          const first = assigned[0];
          if (!canPair(first, candidate)) continue;
        }
        
        foundCandidate = candidate;
        break;
      }
      
      if (foundCandidate) {
        assigned.push(foundCandidate);
        markAssignedToSlot(foundCandidate.id);
      } else {
        // No more eligible candidates
        break;
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
      
      // Mark ES group member as working at this shift (for cross-post tracking)
      markESMemberWorking(person.id, slot.day, slot.shiftLabel);
    }
  }

  if (unfilledMandatory) {
    return { assignments: [], error: 'not enough manpower' };
  }

  return { assignments };
}
