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
 * @param {Array} existingAssignments - Pre-existing assignments to keep [{ postId, personId, day, shiftLabel }]
 */
export function scheduleGenerator(people, posts, startISO, endISO, shiftOverrides = [], esAssignments = [], existingAssignments = []) {
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
  for (const es of esAssignments) {
    for (const personId of es.personIds) {
      const numericId = Number(personId);
      personToESGroup.set(numericId, es.groupId);
    }
  }

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
    return !workingGroups.has(groupId);
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

  // Create a map of existing assignments by slot key
  const existingBySlot = new Map();
  for (const ea of existingAssignments) {
    const key = `${ea.postId}|${ea.day}|${ea.shiftLabel}`;
    if (!existingBySlot.has(key)) {
      existingBySlot.set(key, []);
    }
    existingBySlot.get(key).push(Number(ea.personId));
  }

  // Pre-process existing assignments to update tracking
  // Sort existing assignments by time to maintain proper rest tracking
  const sortedExisting = [...existingAssignments].sort((a, b) => {
    const aTs = timeSlots.find(ts => ts.day === a.day && ts.shiftLabel === a.shiftLabel);
    const bTs = timeSlots.find(ts => ts.day === b.day && ts.shiftLabel === b.shiftLabel);
    if (!aTs || !bTs) return 0;
    return aTs.start.localeCompare(bTs.start);
  });

  for (const ea of sortedExisting) {
    const personId = Number(ea.personId);
    const ts = timeSlots.find(t => t.day === ea.day && t.shiftLabel === ea.shiftLabel);
    if (ts) {
      // Update last end time for rest tracking
      if (!lastEndByPerson[personId] || ts.end > lastEndByPerson[personId]) {
        lastEndByPerson[personId] = ts.end;
      }
      shiftCountByPerson[personId] = (shiftCountByPerson[personId] || 0) + 1;
      
      // Mark ES member as working
      markESMemberWorking(personId, ea.day, ea.shiftLabel);
    }
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
        optional: !!post.optional || required === 0,
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
    
    // Check for existing assignments for this slot
    const slotKey = `${slot.postId}|${slot.day}|${slot.shiftLabel}`;
    const existingPersonIds = existingBySlot.get(slotKey) || [];
    
    // Add existing assignments first
    for (const personId of existingPersonIds) {
      const person = people.find(p => p.id === personId);
      if (person) {
        assigned.push(person);
        const groupId = personToESGroup.get(personId);
        if (groupId) {
          esGroupsInThisSlot.add(groupId);
        }
        
        // Add to final assignments
        assignments.push({
          postId: slot.postId,
          personId: person.id,
          shiftLabel: slot.shiftLabel,
          start: slot.start,
          end: slot.end,
          day: slot.day,
        });
      }
    }
    
    // Helper to check if person can be assigned to this specific slot
    function canAssignToThisSlot(personId) {
      const groupId = personToESGroup.get(personId);
      if (!groupId) return true;
      
      if (esGroupsInThisSlot.has(groupId)) return false;
      
      return canESMemberWork(personId, slot.day, slot.shiftLabel);
    }
    
    // Helper to mark person as assigned to this slot
    function markAssignedToSlot(personId) {
      const groupId = personToESGroup.get(personId);
      if (groupId) {
        esGroupsInThisSlot.add(groupId);
      }
    }

    // Only fill remaining slots if we need more people
    const stillNeeded = needed - assigned.length;
    
    if (stillNeeded > 0) {
      // Get eligible candidates sorted by least shifts (equal distribution)
      let candidates = people
        .filter(p => canWork(p, slot))
        .filter(p => !assigned.some(a => a.id === p.id)) // Exclude already assigned
        .sort((a, b) => shiftCountByPerson[a.id] - shiftCountByPerson[b.id]);

      // Assign remaining needed people
      for (let i = 0; i < stillNeeded; i++) {
        let foundCandidate = null;
        
        for (const candidate of candidates) {
          if (assigned.some(a => a.id === candidate.id)) continue;
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
          
          // Add to final assignments
          assignments.push({
            postId: slot.postId,
            personId: foundCandidate.id,
            shiftLabel: slot.shiftLabel,
            start: slot.start,
            end: slot.end,
            day: slot.day,
          });
          
          // Update tracking
          lastEndByPerson[foundCandidate.id] = slot.end;
          shiftCountByPerson[foundCandidate.id]++;
          markESMemberWorking(foundCandidate.id, slot.day, slot.shiftLabel);
        } else {
          break;
        }
      }
    }

    // Check if we filled the slot
    if (assigned.length < needed && !slot.optional) {
      unfilledMandatory = true;
    }
  }

  if (unfilledMandatory) {
    return { assignments: [], error: 'not enough manpower' };
  }

  return { assignments };
}
