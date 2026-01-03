import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Stack,
  IconButton,
  CircularProgress,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';
import { useI18n } from '../util/i18n';
import { saveAllSchedules } from '../api';
import { exportKitchenToExcel } from './schedule';
import type {
  Assignment,
  BWAssignment,
  Constraint,
  EscortAssignment,
  EscortSettings,
  KitchenAssignment,
  KitchenSettings,
  KitchenShift,
  Person,
  ESGroupAssignment,
} from '../types';
import DutyEditDialog from './schedule/DutyEditDialog';
import { DutyShiftSettingsDialog } from './schedule/DutyShiftSettingsDialog';

type Props = {
  people: Person[];
  kitchenDay: string; // YYYY-MM-DD (local)
  onKitchenDayChange?: (v: string) => void;
  archiveStart?: string;
  archiveEnd?: string;
  assignments: Assignment[];
  bwAssignments: BWAssignment[];
  esAssignments: ESGroupAssignment[];
  kitchenAssignments: KitchenAssignment[];
  onKitchenAssignmentsChange: (a: KitchenAssignment[]) => void;
  escortAssignments: EscortAssignment[];
  onEscortAssignmentsChange: (a: EscortAssignment[]) => void;
  kitchenSettings: KitchenSettings;
  onKitchenSettingsChange: (s: KitchenSettings) => void;
  escortSettings: EscortSettings;
  onEscortSettingsChange: (s: EscortSettings) => void;
  constraints: Constraint[];
  onGenerate: () => void;
  onClear: () => void;
  onAddConstraint: () => void;
  isGenerating?: boolean;
  readOnly?: boolean;
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const parseHHmm = (s: string, fallback: string) => {
  const m = (s || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const hh = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return `${pad2(hh)}:${pad2(mm)}`;
};

const hhmmToMinutes = (hhmm: string) => {
  const m = (hhmm || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
};

const clampShift2Start = (hhmm: string) => {
  // keep inside 06:00..20:59 so we still have a non-empty second shift ending at 21:00
  const min = 6 * 60;
  const max = 20 * 60 + 59;
  const mins = hhmmToMinutes(hhmm);
  const clamped = Math.min(max, Math.max(min, mins));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
};

const buildRange = (day: string, startHHmm: string, endHHmm: string, scheduleStart: dayjs.Dayjs, scheduleEnd: dayjs.Dayjs) => {
  let start = dayjs(`${day}T${startHHmm}:00`);
  let end = dayjs(`${day}T${endHHmm}:00`);
  if (!end.isAfter(start)) end = end.add(1, 'day');
  if (start.isBefore(scheduleStart)) start = scheduleStart;
  if (end.isAfter(scheduleEnd)) end = scheduleEnd;
  if (!end.isAfter(start)) return null;
  return { start: start.toISOString(), end: end.toISOString() };
};

const KitchenDutyView: React.FC<Props> = ({
  people,
  kitchenDay,
  onKitchenDayChange,
  archiveStart,
  archiveEnd,
  assignments,
  bwAssignments,
  esAssignments,
  kitchenAssignments,
  onKitchenAssignmentsChange,
  escortAssignments,
  onEscortAssignmentsChange,
  kitchenSettings,
  onKitchenSettingsChange,
  escortSettings,
  onEscortSettingsChange,
  constraints,
  onGenerate,
  onClear,
  onAddConstraint,
  isGenerating = false,
  readOnly = false,
}) => {
  const { t, lang, rtl } = useI18n();
  const scheduleStart = useMemo(() => dayjs(`${kitchenDay}T06:00:00`), [kitchenDay]);
  const scheduleEnd = useMemo(() => dayjs(`${kitchenDay}T21:00:00`), [kitchenDay]);

  const newShiftId = () => {
    // Prefer browser UUID; fall back to time-based.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCrypto: any = (globalThis as any).crypto;
    if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();
    return `kitchen_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const defaultKitchenShifts = (): KitchenShift[] => ([
    { id: newShiftId(), start: '06:00', end: '21:00', required: 36 },
  ]);

  // Ensure we always have at least one valid shift array in settings.
  React.useEffect(() => {
    if (!kitchenSettings?.shifts || kitchenSettings.shifts.length < 1) {
      onKitchenSettingsChange({ shifts: defaultKitchenShifts() });
    }
  }, [kitchenSettings, onKitchenSettingsChange]);

  const kitchenShiftList: KitchenShift[] = useMemo(() => {
    if (kitchenSettings?.shifts && kitchenSettings.shifts.length > 0) return kitchenSettings.shifts;
    return defaultKitchenShifts();
  }, [kitchenSettings]);

  const kitchenStartISO = `${kitchenDay}T06:00:00`;
  const kitchenEndISO = `${kitchenDay}T21:00:00`;

  const recomputeKitchenAssignmentTimes = (assignmentsToUpdate: KitchenAssignment[], nextShifts: KitchenShift[]) => {
    // Rebuild start/end for assignments on the selected kitchen day so hours track shift edits.
    const defs = nextShifts.map(s => ({ id: s.id, start: parseHHmm(s.start, '06:00'), end: parseHHmm(s.end, '21:00') }));
    const byId = new Map(defs.map(d => [d.id, d]));
    return assignmentsToUpdate.map(a => {
      if (a.day !== kitchenDay) return a;
      const def = byId.get(a.shiftId);
      if (!def) return a;
      const range = buildRange(kitchenDay, def.start, def.end, scheduleStart, scheduleEnd);
      if (!range) return a;
      return { ...a, start: range.start, end: range.end };
    });
  };

  const minutesBetween = (startHHmm: string, endHHmm: string) => hhmmToMinutes(endHHmm) - hhmmToMinutes(startHHmm);

  const setKitchenShifts = (next: KitchenShift[], baseAssignments: KitchenAssignment[] = kitchenAssignments) => {
    onKitchenSettingsChange({ shifts: next });
    onKitchenAssignmentsChange(recomputeKitchenAssignmentTimes(baseAssignments, next));
  };

  const clampBoundary = (mins: number, min: number, max: number) => Math.min(max, Math.max(min, mins));

  const updateBoundaryAfter = (idx: number, newBoundaryHHmm: string) => {
    // Updates shifts[idx].end and shifts[idx+1].start to the same boundary time.
    const shifts = [...kitchenShiftList];
    if (idx < 0 || idx >= shifts.length - 1) return;
    const prev = shifts[idx];
    const next = shifts[idx + 1];
    const prevStart = hhmmToMinutes(parseHHmm(prev.start, '06:00'));
    const nextEnd = hhmmToMinutes(parseHHmm(next.end, '21:00'));
    const desired = hhmmToMinutes(parseHHmm(newBoundaryHHmm, prev.end));
    // keep at least 1 minute duration for both sides
    const boundary = clampBoundary(desired, prevStart + 1, nextEnd - 1);
    const hhmm = `${pad2(Math.floor(boundary / 60))}:${pad2(boundary % 60)}`;
    shifts[idx] = { ...prev, end: hhmm };
    shifts[idx + 1] = { ...next, start: hhmm };
    setKitchenShifts(shifts);
  };

  const updateBoundaryBefore = (idx: number, newBoundaryHHmm: string) => {
    // Updates shifts[idx-1].end and shifts[idx].start to the same boundary time.
    const shifts = [...kitchenShiftList];
    if (idx <= 0 || idx >= shifts.length) return;
    const prev = shifts[idx - 1];
    const cur = shifts[idx];
    const prevStart = hhmmToMinutes(parseHHmm(prev.start, '06:00'));
    const curEnd = hhmmToMinutes(parseHHmm(cur.end, '21:00'));
    const desired = hhmmToMinutes(parseHHmm(newBoundaryHHmm, cur.start));
    // keep at least 1 minute duration for both sides
    const boundary = clampBoundary(desired, prevStart + 1, curEnd - 1);
    const hhmm = `${pad2(Math.floor(boundary / 60))}:${pad2(boundary % 60)}`;
    shifts[idx - 1] = { ...prev, end: hhmm };
    shifts[idx] = { ...cur, start: hhmm };
    setKitchenShifts(shifts);
  };

  const addShift = () => {
    const shifts = [...kitchenShiftList];
    if (shifts.length < 1) {
      setKitchenShifts(defaultKitchenShifts());
      return;
    }
    // Split the longest shift at midpoint (nearest minute).
    let bestIdx = 0;
    let bestLen = -1;
    for (let i = 0; i < shifts.length; i += 1) {
      const len = minutesBetween(parseHHmm(shifts[i].start, '06:00'), parseHHmm(shifts[i].end, '21:00'));
      if (len > bestLen) { bestLen = len; bestIdx = i; }
    }
    const target = shifts[bestIdx];
    const sM = hhmmToMinutes(parseHHmm(target.start, '06:00'));
    const eM = hhmmToMinutes(parseHHmm(target.end, '21:00'));
    if (eM - sM < 2) return; // can't split a 1-minute shift
    const mid = Math.round((sM + eM) / 2);
    const midHHmm = `${pad2(Math.floor(mid / 60))}:${pad2(mid % 60)}`;
    const newShift: KitchenShift = { id: newShiftId(), start: midHHmm, end: parseHHmm(target.end, '21:00'), required: Math.max(0, Number(target.required ?? 36)) };
    shifts[bestIdx] = { ...target, end: midHHmm };
    shifts.splice(bestIdx + 1, 0, newShift);
    setKitchenShifts(shifts);
  };

  const removeShiftAt = (idx: number) => {
    const shifts = [...kitchenShiftList];
    if (shifts.length <= 1) return;
    if (idx < 0 || idx >= shifts.length) return;
    const removed = shifts[idx];
    // Drop assignments for removed shiftId (rule).
    const filteredAssignments = kitchenAssignments.filter(a => a.shiftId !== removed.id);

    if (idx === 0) {
      // next shift starts at 06:00
      shifts[1] = { ...shifts[1], start: '06:00' };
      shifts.splice(0, 1);
      setKitchenShifts(shifts, filteredAssignments);
      return;
    }
    if (idx === shifts.length - 1) {
      // prev shift ends at 21:00
      shifts[idx - 1] = { ...shifts[idx - 1], end: '21:00' };
      shifts.splice(idx, 1);
      setKitchenShifts(shifts, filteredAssignments);
      return;
    }
    const startM = hhmmToMinutes(parseHHmm(removed.start, '06:00'));
    const endM = hhmmToMinutes(parseHHmm(removed.end, '21:00'));
    const mid = Math.round((startM + endM) / 2);
    const midHHmm = `${pad2(Math.floor(mid / 60))}:${pad2(mid % 60)}`;
    shifts[idx - 1] = { ...shifts[idx - 1], end: midHHmm };
    shifts[idx + 1] = { ...shifts[idx + 1], start: midHHmm };
    shifts.splice(idx, 1);
    setKitchenShifts(shifts, filteredAssignments);
  };

  const updateRequiredForShift = (shiftId: string, required: number) => {
    const next = kitchenShiftList.map(s => (s.id === shiftId ? { ...s, required } : s));
    setKitchenShifts(next);
  };

  const kitchenShifts = useMemo(
    () =>
      kitchenShiftList.map(s => ({
        id: s.id,
        label: `${parseHHmm(s.start, '06:00')}-${parseHHmm(s.end, '21:00')}`,
        start: parseHHmm(s.start, '06:00'),
        end: parseHHmm(s.end, '21:00'),
      })),
    [kitchenShiftList]
  );

  const kitchenShiftLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of kitchenShifts) m.set(s.id, s.label);
    return m;
  }, [kitchenShifts]);
  const kitchenLabel = (shiftId: string) => kitchenShiftLabelById.get(shiftId) || shiftId;

  const escortShifts = useMemo(() => ([
    { id: 'escort_1', label: '07:00-10:30', start: '07:00', end: '10:30' },
    { id: 'escort_2', label: '10:30-14:00', start: '10:30', end: '14:00' },
    { id: 'escort_3', label: '14:00-17:00', start: '14:00', end: '17:00' },
    { id: 'escort_4', label: '17:00-19:00', start: '17:00', end: '19:00' },
  ]), []);

  const requiredForKitchenShift = (shiftId: string) => {
    const s = kitchenShiftList.find(x => x.id === shiftId);
    return Math.max(0, Number(s?.required ?? 36));
  };

  const requiredForEscortShift = (shiftId: string) => {
    if (shiftId === 'escort_1') return Math.max(0, Number(escortSettings.requiredShift1 ?? 4));
    if (shiftId === 'escort_2') return Math.max(0, Number(escortSettings.requiredShift2 ?? 4));
    if (shiftId === 'escort_3') return Math.max(0, Number(escortSettings.requiredShift3 ?? 4));
    if (shiftId === 'escort_4') return Math.max(0, Number(escortSettings.requiredShift4 ?? 4));
    return 0;
  };

  const daysInRange = useMemo(() => {
    const out: string[] = [];
    let cursor = scheduleStart.startOf('day');
    const last = scheduleEnd.startOf('day');
    while (cursor.isBefore(last) || cursor.isSame(last, 'day')) {
      out.push(cursor.format('YYYY-MM-DD'));
      cursor = cursor.add(1, 'day');
    }
    return out;
  }, [scheduleStart, scheduleEnd]);

  const daysWithAnyKitchen = useMemo(() => {
    const set = new Set<string>();
    for (const day of daysInRange) {
      if (kitchenShifts.some(s => !!buildRange(day, s.start, s.end, scheduleStart, scheduleEnd))) set.add(day);
    }
    // Include days from existing assignments (in case they exist and overlap)
    for (const a of kitchenAssignments) set.add(a.day);
    return Array.from(set).sort();
  }, [daysInRange, kitchenShifts, scheduleStart, scheduleEnd, kitchenAssignments]);

  // Run validation when assignments change
  React.useEffect(() => {
    validateKitchenAssignments();
  }, [kitchenAssignments, escortAssignments, assignments, constraints]);

  const daysWithAnyEscort = useMemo(() => {
    const set = new Set<string>();
    for (const day of daysInRange) {
      if (escortShifts.some(s => !!buildRange(day, s.start, s.end, scheduleStart, scheduleEnd))) set.add(day);
    }
    for (const a of escortAssignments) set.add(a.day);
    return Array.from(set).sort();
  }, [daysInRange, escortShifts, scheduleStart, scheduleEnd, escortAssignments]);

  const getNames = (personIds: number[]) =>
    personIds.map(pid => people.find(p => p.id === pid)?.name || String(pid)).join(', ');

  const getKitchenPersonIds = (day: string, shiftId: string) =>
    kitchenAssignments.filter(a => a.day === day && a.shiftId === shiftId).map(a => a.personId);

  const getEscortPersonIds = (day: string, shiftId: string) =>
    escortAssignments.filter(a => a.day === day && a.shiftId === shiftId).map(a => a.personId);

  // Validation
  const validateKitchenAssignments = () => {
    const errors: string[] = [];
    const newInvalidKitchenCells = new Set<string>();
    const newInvalidEscortCells = new Set<string>();

    // Staffing count validation (kitchen + escort): explicitly report missing/extra people per shift.
    for (const day of daysWithAnyKitchen) {
      for (const shift of kitchenShifts) {
        const range = buildRange(day, shift.start, shift.end, scheduleStart, scheduleEnd);
        if (!range) continue;
        const assigned = getKitchenPersonIds(day, shift.id);
        const required = requiredForKitchenShift(shift.id);
        if (assigned.length !== required) {
          newInvalidKitchenCells.add(`${day}|${shift.id}`);
          errors.push(`${day} ${shift.label}: ${t('Required')} ${required} ${t('has')} ${assigned.length}`);
        }
      }
    }
    for (const day of daysWithAnyEscort) {
      for (const shift of escortShifts) {
        const range = buildRange(day, shift.start, shift.end, scheduleStart, scheduleEnd);
        if (!range) continue;
        const assigned = getEscortPersonIds(day, shift.id);
        const required = requiredForEscortShift(shift.id);
        if (assigned.length !== required) {
          newInvalidEscortCells.add(`${day}|${shift.id}`);
          errors.push(`${day} ${shift.label}: ${t('Required')} ${required} ${t('has')} ${assigned.length}`);
        }
      }
    }

    // Check for overlapping kitchen assignments for the same person
    for (const person of people) {
      const personKitchenAssignments = kitchenAssignments.filter(a => a.personId === person.id);
      for (let i = 0; i < personKitchenAssignments.length; i++) {
        for (let j = i + 1; j < personKitchenAssignments.length; j++) {
          const a1 = personKitchenAssignments[i];
          const a2 = personKitchenAssignments[j];
          if (a1.start && a1.end && a2.start && a2.end) {
            const start1 = dayjs(a1.start);
            const end1 = dayjs(a1.end);
            const start2 = dayjs(a2.start);
            const end2 = dayjs(a2.end);

            // Check if ranges actually overlap (not just touch at boundary)
            // Use minute precision to handle edge cases
            if ((end1.isSame(start2, 'minute') || end1.isBefore(start2, 'minute')) || 
                (end2.isSame(start1, 'minute') || end2.isBefore(start1, 'minute'))) {
              // Adjacent shifts (one ends when the other starts) - not overlapping
            } else if (start1.isBefore(end2) && start2.isBefore(end1)) {
              errors.push(`${person.name}: ${t('Overlapping shift in this timeframe')} (${a1.day} ${kitchenLabel(a1.shiftId)} & ${a2.day} ${kitchenLabel(a2.shiftId)})`);
              newInvalidKitchenCells.add(`${a1.day}|${a1.shiftId}`);
              newInvalidKitchenCells.add(`${a2.day}|${a2.shiftId}`);
            }
          }
        }
      }
    }

    // Check for overlapping escort assignments for the same person
    for (const person of people) {
      const personEscortAssignments = escortAssignments.filter(a => a.personId === person.id);
      for (let i = 0; i < personEscortAssignments.length; i++) {
        for (let j = i + 1; j < personEscortAssignments.length; j++) {
          const a1 = personEscortAssignments[i];
          const a2 = personEscortAssignments[j];
          if (a1.start && a1.end && a2.start && a2.end) {
            const start1 = dayjs(a1.start);
            const end1 = dayjs(a1.end);
            const start2 = dayjs(a2.start);
            const end2 = dayjs(a2.end);

            // Check if ranges actually overlap (not just touch at boundary)
            // Use minute precision to handle edge cases
            if ((end1.isSame(start2, 'minute') || end1.isBefore(start2, 'minute')) || 
                (end2.isSame(start1, 'minute') || end2.isBefore(start1, 'minute'))) {
              // Adjacent shifts (one ends when the other starts) - not overlapping
            } else if (start1.isBefore(end2) && start2.isBefore(end1)) {
              errors.push(`${person.name}: ${t('Overlapping shift in this timeframe')} (${a1.day} ${t(a1.shiftId)} & ${a2.day} ${t(a2.shiftId)})`);
              newInvalidEscortCells.add(`${a1.day}|${a1.shiftId}`);
              newInvalidEscortCells.add(`${a2.day}|${a2.shiftId}`);
            }
          }
        }
      }
    }

    // Check for overlaps between kitchen assignments and guard assignments
    for (const kitchen of kitchenAssignments) {
      if (!kitchen.start || !kitchen.end) continue;
      const kitchenStart = dayjs(kitchen.start);
      const kitchenEnd = dayjs(kitchen.end);

      for (const guard of assignments) {
        if (guard.personId !== kitchen.personId) continue;
        const guardStart = dayjs(guard.start);
        const guardEnd = dayjs(guard.end);

        // Check if ranges actually overlap (not just touch at boundary)
        // Use minute precision to handle edge cases
        if (!(kitchenEnd.isSame(guardStart, 'minute') || kitchenEnd.isBefore(guardStart, 'minute')) && 
            !(guardEnd.isSame(kitchenStart, 'minute') || guardEnd.isBefore(kitchenStart, 'minute')) && 
            kitchenStart.isBefore(guardEnd) && guardStart.isBefore(kitchenEnd)) {
          const person = people.find(p => p.id === kitchen.personId);
          errors.push(`${person?.name || kitchen.personId}: ${t('Overlapping shift in this timeframe')} (${kitchen.day} ${kitchenLabel(kitchen.shiftId)} & ${guard.day} ${guard.shiftLabel})`);
          newInvalidKitchenCells.add(`${kitchen.day}|${kitchen.shiftId}`);
        }
      }
    }

    // Check for overlaps between escort assignments and guard assignments
    for (const escort of escortAssignments) {
      if (!escort.start || !escort.end) continue;
      const escortStart = dayjs(escort.start);
      const escortEnd = dayjs(escort.end);

      for (const guard of assignments) {
        if (guard.personId !== escort.personId) continue;
        const guardStart = dayjs(guard.start);
        const guardEnd = dayjs(guard.end);

        // Check if ranges actually overlap (not just touch at boundary)
        // Use minute precision to handle edge cases
        if (!(escortEnd.isSame(guardStart, 'minute') || escortEnd.isBefore(guardStart, 'minute')) && 
            !(guardEnd.isSame(escortStart, 'minute') || guardEnd.isBefore(escortStart, 'minute')) && 
            escortStart.isBefore(guardEnd) && guardStart.isBefore(escortEnd)) {
          const person = people.find(p => p.id === escort.personId);
          errors.push(`${person?.name || escort.personId}: ${t('Overlapping shift in this timeframe')} (${escort.day} ${t(escort.shiftId)} & ${guard.day} ${guard.shiftLabel})`);
          newInvalidEscortCells.add(`${escort.day}|${escort.shiftId}`);
        }
      }
    }

    // Check for overlaps between kitchen and escort assignments for the same person
    for (const kitchen of kitchenAssignments) {
      if (!kitchen.start || !kitchen.end) continue;
      const kitchenStart = dayjs(kitchen.start);
      const kitchenEnd = dayjs(kitchen.end);

      for (const escort of escortAssignments) {
        if (escort.personId !== kitchen.personId) continue;
        if (!escort.start || !escort.end) continue;
        const escortStart = dayjs(escort.start);
        const escortEnd = dayjs(escort.end);

        // Check if ranges actually overlap (not just touch at boundary)
        // Use minute precision to handle edge cases
        if (!(kitchenEnd.isSame(escortStart, 'minute') || kitchenEnd.isBefore(escortStart, 'minute')) && 
            !(escortEnd.isSame(kitchenStart, 'minute') || escortEnd.isBefore(kitchenStart, 'minute')) && 
            kitchenStart.isBefore(escortEnd) && escortStart.isBefore(kitchenEnd)) {
          const person = people.find(p => p.id === kitchen.personId);
          errors.push(`${person?.name || kitchen.personId}: ${t('Overlapping shift in this timeframe')} (${kitchen.day} ${kitchenLabel(kitchen.shiftId)} & ${escort.day} ${t(escort.shiftId)})`);
          newInvalidKitchenCells.add(`${kitchen.day}|${kitchen.shiftId}`);
          newInvalidEscortCells.add(`${escort.day}|${escort.shiftId}`);
        }
      }
    }

    // Check constraint conflicts
    for (const assignment of [...kitchenAssignments, ...escortAssignments]) {
      if (!assignment.start || !assignment.end) continue;
      const assignmentStart = dayjs(assignment.start);
      const assignmentEnd = dayjs(assignment.end);

      const personConstraints = constraints.filter(c => c.personId === assignment.personId);
      for (const constraint of personConstraints) {
        const constraintStart = dayjs(constraint.startISO);
        const constraintEnd = dayjs(constraint.endISO);

        // Check if ranges actually overlap (not just touch at boundary)
        // Use minute precision to handle edge cases
        if (!(assignmentEnd.isSame(constraintStart, 'minute') || assignmentEnd.isBefore(constraintStart, 'minute')) && 
            !(constraintEnd.isSame(assignmentStart, 'minute') || constraintEnd.isBefore(assignmentStart, 'minute')) && 
            assignmentStart.isBefore(constraintEnd) && constraintStart.isBefore(assignmentEnd)) {
          const person = people.find(p => p.id === assignment.personId);
          const isKitchen = kitchenAssignments.includes(assignment);
          const label = isKitchen ? kitchenLabel(assignment.shiftId) : t(assignment.shiftId);
          errors.push(`${person?.name || assignment.personId}: ${t('Constraint conflict')}: ${constraint.title} (${assignment.day} ${label})`);
          if (isKitchen) {
            newInvalidKitchenCells.add(`${assignment.day}|${assignment.shiftId}`);
          } else {
            newInvalidEscortCells.add(`${assignment.day}|${assignment.shiftId}`);
          }
        }
      }
    }

    setValidationErrors(errors);
    setInvalidKitchenCells(newInvalidKitchenCells);
    setInvalidEscortCells(newInvalidEscortCells);

    return errors.length === 0;
  };

  const [dialog, setDialog] = useState<{
    open: boolean;
    type: 'kitchen' | 'escort';
    day: string;
    shiftId: string;
    label: string;
    range: { start: string; end: string } | null;
  }>({ open: false, type: 'kitchen', day: '', shiftId: '', label: '', range: null });

  const [saveError, setSaveError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [invalidKitchenCells, setInvalidKitchenCells] = useState<Set<string>>(new Set());
  const [invalidEscortCells, setInvalidEscortCells] = useState<Set<string>>(new Set());

  const [shiftSettingsDialog, setShiftSettingsDialog] = useState<{
    open: boolean;
    type: 'kitchen' | 'escort';
    shiftId: string;
    shiftLabel: string;
  }>({ open: false, type: 'kitchen', shiftId: '', shiftLabel: '' });

  const openKitchenDialog = (day: string, shiftId: string) => {
    const def = kitchenShifts.find(s => s.id === shiftId);
    if (!def) return;
    const range = buildRange(day, def.start, def.end, scheduleStart, scheduleEnd);
    if (!range) return;
    setDialog({ open: true, type: 'kitchen', day, shiftId, label: def.label, range });
  };

  const openEscortDialog = (day: string, shiftId: string) => {
    const def = escortShifts.find(s => s.id === shiftId);
    if (!def) return;
    const range = buildRange(day, def.start, def.end, scheduleStart, scheduleEnd);
    if (!range) return;
    setDialog({ open: true, type: 'escort', day, shiftId, label: def.label, range });
  };

  const updateKitchenCell = (day: string, shiftId: string, personIds: number[], range: { start: string; end: string }) => {
    const filtered = kitchenAssignments.filter(a => !(a.day === day && a.shiftId === shiftId));
    const updated: KitchenAssignment[] = [
      ...filtered,
      ...personIds.map(personId => ({ day, shiftId, personId, start: range.start, end: range.end })),
    ];
    onKitchenAssignmentsChange(updated);
  };

  const updateEscortCell = (day: string, shiftId: string, personIds: number[], range: { start: string; end: string }) => {
    const filtered = escortAssignments.filter(a => !(a.day === day && a.shiftId === shiftId));
    const updated: EscortAssignment[] = [
      ...filtered,
      ...personIds.map(personId => ({ day, shiftId, personId, start: range.start, end: range.end })),
    ];
    onEscortAssignmentsChange(updated);
  };

  const handleSave = async () => {
    // Check for validation errors before saving
    const isValid = validateKitchenAssignments();
    if (!isValid) {
      setSaveError(t('Cannot save: Please fix validation errors first'));
      return; // Don't save if there are validation errors
    }

    setIsSaving(true);
    setSaveError('');
    try {
      const archiveS = archiveStart || kitchenStartISO;
      const archiveE = archiveEnd || kitchenEndISO;
      const res = await saveAllSchedules(
        assignments,
        bwAssignments,
        esAssignments,
        kitchenAssignments,
        escortAssignments,
        kitchenSettings,
        escortSettings,
        archiveS,
        archiveE
      );
      if (!res.ok) {
        setSaveError(res.error || t('Save failed'));
      } else {
        setValidationErrors([]);
        setInvalidKitchenCells(new Set());
        setInvalidEscortCells(new Set());
      }
    } catch (e: any) {
      setSaveError(e?.message || t('Save failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const kitchenTitle = lang === 'he' ? 'מטבח' : t('Kitchen');
  const escortTitle = 'ליווי קבלנים';

  const cellHeightKitchen = 120;
  const cellHeightEscort = 65;

  return (
    <Box>
      <Typography variant="h6" gutterBottom>{t('Scheduler')}</Typography>


      {!readOnly && (
        <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center" sx={{ mb: 2 }}>
          <TextField
            type="date"
            label={t('Day')}
            value={kitchenDay}
            onChange={e => onKitchenDayChange?.(e.target.value)}
            InputLabelProps={{ shrink: true }}
            size="small"
            />
          <Button variant="contained" onClick={onGenerate} disabled={isGenerating || isSaving}>
            {isGenerating ? t('Assigning') : t('Generate')}
          </Button>
          <Button variant="outlined" color="error" onClick={onClear} disabled={isGenerating || isSaving}>
            {t('Clear')}
          </Button>
          <Button variant="outlined" onClick={onAddConstraint} disabled={isGenerating || isSaving}>
            {t('Add Constraint')}
          </Button>
          <Button
            variant="outlined"
            onClick={() => exportKitchenToExcel({
              people,
              kitchenAssignments,
              escortAssignments,
              kitchenSettings,
              escortSettings,
              kitchenStart: kitchenStartISO,
              kitchenEnd: kitchenEndISO,
              t
            })}
            disabled={isGenerating || isSaving}
          >
            {t('Export to Excel')}
          </Button>
          <Button variant="contained" color="success" onClick={handleSave} disabled={isGenerating || isSaving}>
            {t('Save Schedule')}
          </Button>
        </Stack>
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="subtitle2">{t('Schedule is invalid')}:</Typography>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {validationErrors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
            {validationErrors.length > 10 && (
              <li>...{t('and')} {validationErrors.length - 10} {t('more errors')}</li>
            )}
          </ul>
        </Alert>
      )}

      {/* Loading indicator during generation */}
            {isGenerating && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <CircularProgress size="2rem" />
                <Typography variant="h5">{t('Assigning')}</Typography>
              </Box>
            )}

            {/* Loading indicator during save */}
            {isSaving && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <CircularProgress size="2rem" />
                <Typography variant="h5">{t('Saving')}</Typography>
              </Box>
            )}

      {saveError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {saveError}
        </Alert>
      )}

      {/* Kitchen table */}
      <Typography variant="h6" align="center" sx={{ mb: 1 }}>
        {kitchenTitle}
      </Typography>
      <Box sx={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {rtl && (
                <th style={{ border: '1px solid #888', background: '#f0f0f0', width: '20%', padding: '8px 4px' }}>
                  {t('Hours')}
                </th>
              )}
              {daysWithAnyKitchen.map(day => (
                <th key={day} style={{ border: '1px solid #888', background: '#f0f0f0', width: `${daysWithAnyKitchen.length > 0 ? 80 / daysWithAnyKitchen.length : 80}%`, padding: '8px 4px' }}>
                  {day}
                </th>
              ))}
              {!rtl && (
                <th style={{ border: '1px solid #888', background: '#f0f0f0', width: '20%', padding: '8px 4px' }}>
                  {t('Hours')}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {kitchenShifts.map(shift => (
              <tr key={shift.id}>
                {rtl && (
                  <td style={{ border: '1px solid #888', padding: '6px 8px', background: '#fafafa', fontWeight: 600, verticalAlign: 'top', height: cellHeightKitchen }}>
                    {shift.label}
                  </td>
                )}
                {daysWithAnyKitchen.map(day => {
                  const range = buildRange(day, shift.start, shift.end, scheduleStart, scheduleEnd);
                  if (!range) {
                    return <td key={`${day}|${shift.id}`} style={{ padding: 0, border: 'none', width: 0, visibility: 'hidden' }} />;
                  }
                  const personIds = getKitchenPersonIds(day, shift.id);
                  const names = getNames(personIds);
                  const required = requiredForKitchenShift(shift.id);
                  const isInvalid = (personIds.length < required) || (invalidKitchenCells.has(`${day}|${shift.id}`) && validationErrors.length > 0);

                  let bgColor = '#fff3e0'; // Default light orange
                  if (isInvalid && validationErrors.length > 0) bgColor = '#ffcdd2'; // Light red for invalid
                  else if (personIds.length === 0) bgColor = '#ffebee'; // Light red/pink for empty
                  else if (personIds.length >= required) bgColor = '#e8f5e9'; // Light green for fully assigned
                  return (
                    <td
                      key={`${day}|${shift.id}`}
                      onClick={() => !readOnly && openKitchenDialog(day, shift.id)}
                      style={{
                        border: isInvalid && validationErrors.length > 0 ? '2px solid #f44336' : '1px solid #ccc',
                        padding: 8,
                        cursor: readOnly ? 'default' : 'pointer',
                        backgroundColor: bgColor,
                        verticalAlign: 'top',
                        height: cellHeightKitchen,
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            lineHeight: 1.4,
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                          }}
                        >
                          {names || <span style={{ color: '#999' }}>—</span>}
                        </Typography>
                        {!readOnly && (
                          <IconButton
                            size="small"
                            sx={{ p: 0.25, flexShrink: 0 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShiftSettingsDialog({ open: true, type: 'kitchen', shiftId: shift.id, shiftLabel: shift.label });
                            }}
                          >
                            <SettingsIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {personIds.length} / {required}
                      </Typography>
                    </td>
                  );
                })}
                {!rtl && (
                  <td style={{ border: '1px solid #888', padding: '6px 8px', background: '#fafafa', fontWeight: 600, verticalAlign: 'top', height: cellHeightKitchen }}>
                    {shift.label}
                  </td>
                )}
              </tr>
            ))}
            {!readOnly && (
              <tr>
                {/* Empty day columns */}
                {rtl && (
                  <td style={{ border: '1px solid #888', padding: 0, background: '#fafafa', height: 44 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 44 }}>
                      <IconButton
                        size="small"
                        onClick={addShift}
                        disabled={isGenerating || isSaving}
                        aria-label={t('Add Shift')}
                      >
                        <AddIcon />
                      </IconButton>
                    </Box>
                  </td>
                )}
                {daysWithAnyKitchen.map(day => (
                  <td key={`add|${day}`} style={{ border: '1px solid #ccc', background: '#fff', height: 44 }} />
                ))}
                {!rtl && (
                  <td style={{ border: '1px solid #888', padding: 0, background: '#fafafa', height: 44 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 44 }}>
                      <IconButton
                        size="small"
                        onClick={addShift}
                        disabled={isGenerating || isSaving}
                        aria-label={t('Add Shift')}
                      >
                        <AddIcon />
                      </IconButton>
                    </Box>
                  </td>
                )}
              </tr>
            )}
          </tbody>
        </table>
      </Box>

      {/* Escort table */}
      <Typography variant="h6" align="center" sx={{ mt: 4, mb: 1 }}>
        {escortTitle}
      </Typography>
      <Box sx={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {rtl && (
                <th style={{ border: '1px solid #888', background: '#f0f0f0', width: '20%', padding: '8px 4px' }}>
                  {t('Hours')}
                </th>
              )}
              {daysWithAnyEscort.map(day => (
                <th key={day} style={{ border: '1px solid #888', background: '#f0f0f0', width: `${daysWithAnyEscort.length > 0 ? 80 / daysWithAnyEscort.length : 80}%`, padding: '8px 4px' }}>
                  {day}
                </th>
              ))}
              {!rtl && (
                <th style={{ border: '1px solid #888', background: '#f0f0f0', width: '20%', padding: '8px 4px' }}>
                  {t('Hours')}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {escortShifts.map(shift => (
              <tr key={shift.id}>
                {rtl && (
                  <td style={{ border: '1px solid #888', padding: '6px 8px', background: '#fafafa', fontWeight: 600, verticalAlign: 'top', height: cellHeightEscort }}>
                    {shift.label}
                  </td>
                )}
                {daysWithAnyEscort.map(day => {
                  const range = buildRange(day, shift.start, shift.end, scheduleStart, scheduleEnd);
                  if (!range) {
                    return <td key={`${day}|${shift.id}`} style={{ padding: 0, border: 'none', width: 0, visibility: 'hidden' }} />;
                  }
                  const personIds = getEscortPersonIds(day, shift.id);
                  const names = getNames(personIds);
                  const required = requiredForEscortShift(shift.id);
                  const isInvalid = (personIds.length < required) || (invalidEscortCells.has(`${day}|${shift.id}`) && validationErrors.length > 0);

                  let bgColor = '#fff3e0'; // Default light orange
                  if (isInvalid && validationErrors.length > 0) bgColor = '#ffcdd2'; // Light red for invalid
                  else if (personIds.length === 0) bgColor = '#ffebee'; // Light red/pink for empty
                  else if (personIds.length >= required) bgColor = '#e8f5e9'; // Light green for fully assigned
                  return (
                    <td
                      key={`${day}|${shift.id}`}
                      onClick={() => !readOnly && openEscortDialog(day, shift.id)}
                      style={{
                        border: isInvalid && validationErrors.length > 0 ? '2px solid #f44336' : '1px solid #ccc',
                        padding: 8,
                        cursor: readOnly ? 'default' : 'pointer',
                        backgroundColor: bgColor,
                        verticalAlign: 'top',
                        height: cellHeightEscort,
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            lineHeight: 1.4,
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                          }}
                        >
                          {names || <span style={{ color: '#999' }}>—</span>}
                        </Typography>
                        {!readOnly && (
                          <IconButton
                            size="small"
                            sx={{ p: 0.25, flexShrink: 0 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShiftSettingsDialog({ open: true, type: 'escort', shiftId: shift.id, shiftLabel: shift.label });
                            }}
                          >
                            <SettingsIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {personIds.length} / {required}
                      </Typography>
                    </td>
                  );
                })}
                {!rtl && (
                  <td style={{ border: '1px solid #888', padding: '6px 8px', background: '#fafafa', fontWeight: 600, verticalAlign: 'top', height: cellHeightEscort }}>
                    {shift.label}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>

      {!readOnly && (
        <DutyShiftSettingsDialog
          open={shiftSettingsDialog.open}
          onClose={() => setShiftSettingsDialog(prev => ({ ...prev, open: false }))}
          title={shiftSettingsDialog.type === 'kitchen' ? kitchenTitle : escortTitle}
          shiftLabel={shiftSettingsDialog.shiftLabel}
          currentRequired={
            shiftSettingsDialog.type === 'kitchen'
              ? requiredForKitchenShift(shiftSettingsDialog.shiftId)
              : requiredForEscortShift(shiftSettingsDialog.shiftId)
          }
          currentStartHHmm={
            shiftSettingsDialog.type === 'kitchen'
              ? (kitchenShiftList.find(s => s.id === shiftSettingsDialog.shiftId)?.start || '06:00')
              : undefined
          }
          currentEndHHmm={
            shiftSettingsDialog.type === 'kitchen'
              ? (kitchenShiftList.find(s => s.id === shiftSettingsDialog.shiftId)?.end || '21:00')
              : undefined
          }
          canEditStart={
            shiftSettingsDialog.type === 'kitchen' &&
            kitchenShiftList.findIndex(s => s.id === shiftSettingsDialog.shiftId) !== 0
          }
          canEditEnd={
            shiftSettingsDialog.type === 'kitchen' &&
            kitchenShiftList.findIndex(s => s.id === shiftSettingsDialog.shiftId) !== kitchenShiftList.length - 1
          }
          canRemove={
            shiftSettingsDialog.type === 'kitchen' &&
            kitchenShiftList.length > 1
          }
          onRemove={() => {
            const idx = kitchenShiftList.findIndex(s => s.id === shiftSettingsDialog.shiftId);
            if (idx >= 0) removeShiftAt(idx);
          }}
          onSave={(required, newStartHHmm, newEndHHmm) => {
            if (shiftSettingsDialog.type === 'kitchen') {
              updateRequiredForShift(shiftSettingsDialog.shiftId, required);
              const idx = kitchenShiftList.findIndex(s => s.id === shiftSettingsDialog.shiftId);
              if (idx >= 0) {
                if (idx > 0 && newStartHHmm) updateBoundaryBefore(idx, newStartHHmm);
                if (idx < kitchenShiftList.length - 1 && newEndHHmm) updateBoundaryAfter(idx, newEndHHmm);
              }
            } else {
              if (shiftSettingsDialog.shiftId === 'escort_1') onEscortSettingsChange({ ...escortSettings, requiredShift1: required });
              if (shiftSettingsDialog.shiftId === 'escort_2') onEscortSettingsChange({ ...escortSettings, requiredShift2: required });
              if (shiftSettingsDialog.shiftId === 'escort_3') onEscortSettingsChange({ ...escortSettings, requiredShift3: required });
              if (shiftSettingsDialog.shiftId === 'escort_4') onEscortSettingsChange({ ...escortSettings, requiredShift4: required });
            }
          }}
        />
      )}

      {dialog.open && dialog.range && (
        <DutyEditDialog
          open={dialog.open}
          onClose={() => setDialog(prev => ({ ...prev, open: false }))}
          title={`${dialog.type === 'kitchen' ? kitchenTitle : escortTitle}: ${dialog.day}`}
          subtitle={`${t('Shift')}: ${dialog.label}`}
          requiredCount={dialog.type === 'kitchen' ? requiredForKitchenShift(dialog.shiftId) : requiredForEscortShift(dialog.shiftId)}
          timeRange={dialog.range}
          people={people}
          currentPersonIds={
            dialog.type === 'kitchen'
              ? getKitchenPersonIds(dialog.day, dialog.shiftId)
              : getEscortPersonIds(dialog.day, dialog.shiftId)
          }
          onSave={(personIds) => {
            if (!dialog.range) return;
            if (dialog.type === 'kitchen') updateKitchenCell(dialog.day, dialog.shiftId, personIds, dialog.range);
            else updateEscortCell(dialog.day, dialog.shiftId, personIds, dialog.range);
          }}
          constraints={constraints}
          guardAssignments={assignments}
          bwAssignments={bwAssignments}
          kitchenAssignments={kitchenAssignments}
          escortAssignments={escortAssignments}
          kitchenSettings={kitchenSettings}
          scheduleStart={archiveStart || kitchenStartISO}
          scheduleEnd={archiveEnd || kitchenEndISO}
          dutyCountRangeStartISO={archiveStart || kitchenStartISO}
          dutyCountRangeEndISO={archiveEnd || kitchenEndISO}
          currentDay={dialog.day}
          currentShiftId={dialog.shiftId}
        />
      )}
    </Box>
  );
};

export default KitchenDutyView;



