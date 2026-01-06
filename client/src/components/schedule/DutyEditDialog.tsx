import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  FormControlLabel,
  Box,
  Typography,
  TextField,
  Tooltip,
} from '@mui/material';
import { useI18n } from '../../util/i18n';
import type { Assignment, BWAssignment, Constraint, Escort400Assignment, EscortAssignment, KitchenAssignment, KitchenSettings, Person, RasarAssignment } from '../../types';
import { BW_SLOT_DEFINITIONS, getBwSlotRangeMinutes, hasTimeOverlap, getShiftTimeWindow, getShiftsForPeriod, getShiftIndex } from './utils';
import { buildDutyCountsByPerson } from './dutyCounts';

type IsoRange = { start: string; end: string };

const pad = (n: number) => String(n).padStart(2, '0');

const getGuardAssignmentIsoRange = (a: Assignment): IsoRange | null => {
  // Prefer deriving from shiftLabel+day (this matches the UI label exactly and avoids timezone / stale start-end issues).
  const m = (a.shiftLabel || '').match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) {
    // Fallback to ISO if label is not parseable.
    if (a.start && a.end) return { start: a.start, end: a.end };
    return null;
  }
  const sh = Number(m[1]);
  const sm = Number(m[2]);
  const eh = Number(m[3]);
  const em = Number(m[4]);
  const start = dayjs(`${a.day}T${pad(sh)}:${pad(sm)}:00`);
  let end = dayjs(`${a.day}T${pad(eh)}:${pad(em)}:00`);
  if (!end.isAfter(start)) end = end.add(1, 'day');
  return { start: start.toISOString(), end: end.toISOString() };
};

const getBwIsoRange = (bw: BWAssignment): IsoRange | null => {
  if (bw.start && bw.end) return { start: bw.start, end: bw.end };
  const slot = BW_SLOT_DEFINITIONS.find(s => s.id === bw.slotId);
  if (!slot) return null;
  const start = dayjs(`${bw.day}T${pad(slot.startHour)}:${pad(slot.startMinute)}:00`);
  let end = dayjs(`${bw.day}T${pad(slot.endHour)}:${pad(slot.endMinute)}:00`);
  if (!end.isAfter(start)) end = end.add(1, 'day');
  return { start: start.toISOString(), end: end.toISOString() };
};

const overlaps = (a: IsoRange, b: IsoRange) => {
  // Normalize to minute precision (drop seconds/ms) to avoid false overlaps from ISO formatting.
  const aStart = dayjs(a.start).second(0).millisecond(0);
  const aEnd = dayjs(a.end).second(0).millisecond(0);
  const bStart = dayjs(b.start).second(0).millisecond(0);
  const bEnd = dayjs(b.end).second(0).millisecond(0);

  // Ranges overlap if: aStart < bEnd AND bStart < aEnd
  // This naturally treats adjacency (aEnd === bStart) as NOT overlapping.
  return aStart.isBefore(bEnd) && bStart.isBefore(aEnd);
};

const formatRangeHHmm = (range: IsoRange) => {
  const s = dayjs(range.start);
  const e = dayjs(range.end);
  if (!s.isValid() || !e.isValid()) return '';
  return `${s.format('HH:mm')}-${e.format('HH:mm')}`;
};

export type DutyEditDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  requiredCount: number;
  timeRange: IsoRange;
  people: Person[];
  currentPersonIds: number[];
  onSave: (personIds: number[]) => void;
  constraints: Constraint[];
  guardAssignments: Assignment[];
  bwAssignments: BWAssignment[];
  kitchenAssignments: KitchenAssignment[];
  escortAssignments: EscortAssignment[];
  rasarAssignments?: RasarAssignment[];
  escort400Assignments?: Escort400Assignment[];
  kitchenSettings?: KitchenSettings;
  scheduleStart?: string;
  scheduleEnd?: string;
  dutyCountRangeStartISO?: string;
  dutyCountRangeEndISO?: string;
  currentDay?: string;
  currentShiftId?: string;
  ineligiblePersonIds?: number[];
  ineligibleReasonLabel?: string;
  enableRestViolation?: boolean;
};

const constraintsByPerson = (constraints: Constraint[]) => {
  const map = new Map<number, IsoRange[]>();
  for (const c of constraints) {
    const arr = map.get(c.personId) || [];
    arr.push({ start: c.startISO, end: c.endISO });
    map.set(c.personId, arr);
  }
  return map;
};

const listHasOverlap = (ranges: IsoRange[], withRange: IsoRange) => ranges.some(r => overlaps(r, withRange));

const DutyEditDialog: React.FC<DutyEditDialogProps> = ({
  open,
  onClose,
  title,
  subtitle,
  requiredCount,
  timeRange,
  people,
  currentPersonIds,
  onSave,
  constraints,
  guardAssignments,
  bwAssignments,
  kitchenAssignments,
  escortAssignments,
  rasarAssignments = [],
  escort400Assignments = [],
  kitchenSettings,
  scheduleStart,
  scheduleEnd,
  dutyCountRangeStartISO,
  dutyCountRangeEndISO,
  currentDay,
  currentShiftId,
  ineligiblePersonIds = [],
  ineligibleReasonLabel,
  enableRestViolation = true,
}) => {
  const { t } = useI18n();
  const [selected, setSelected] = useState<number[]>(currentPersonIds);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setSelected(currentPersonIds);
    setSearch('');
  }, [open, currentPersonIds]);

  const constraintsMap = useMemo(() => constraintsByPerson(constraints), [constraints]);

  const otherDutyRangesByPerson = useMemo(() => {
    const map = new Map<number, IsoRange[]>();
    const add = (personId: number, range: IsoRange | null) => {
      if (!range) return;
      const arr = map.get(personId) || [];
      arr.push(range);
      map.set(personId, arr);
    };

    // Add all guard assignments
    for (const a of guardAssignments) add(a.personId, getGuardAssignmentIsoRange(a));
    // Add all BW assignments
    for (const bw of bwAssignments) add(bw.personId, getBwIsoRange(bw));
    // Add all kitchen assignments (we'll check for overlaps separately)
    for (const k of kitchenAssignments) {
      if (k.start && k.end) {
        const kitchenRange = { start: k.start, end: k.end };
        add(k.personId, kitchenRange);
      }
    }
    // Add all escort assignments (we'll check for overlaps separately)
    for (const e of escortAssignments) {
      if (e.start && e.end) {
        const escortRange = { start: e.start, end: e.end };
        add(e.personId, escortRange);
      }
    }
    return map;
  }, [guardAssignments, bwAssignments, kitchenAssignments, escortAssignments]);

  // Get all shifts for rest violation checking
  const allShifts = useMemo(() => {
    if (!scheduleStart || !scheduleEnd) return [];
    return getShiftsForPeriod(scheduleStart, scheduleEnd);
  }, [scheduleStart, scheduleEnd]);

  // Check for rest violation (8 hours between shifts)
  const hasRestViolation = (personId: number): string | null => {
    if (!scheduleStart || !scheduleEnd) return null;
    
    const timeRangeStart = dayjs(timeRange.start);
    const timeRangeEnd = dayjs(timeRange.end);
    
    // Check guard assignments for rest violations
    // A person needs 8 hours (480 minutes) of rest between shifts
    const minRestMinutes = 8 * 60; // 8 hours
    
    for (const guardAssignment of guardAssignments) {
      if (guardAssignment.personId !== personId) continue;
      
      const guardRange = getGuardAssignmentIsoRange(guardAssignment);
      if (!guardRange) continue;
      
      const guardStart = dayjs(guardRange.start);
      const guardEnd = dayjs(guardRange.end);
      
      // Check if guard shift ends less than 8 hours before our time range starts
      const gapBefore = timeRangeStart.diff(guardEnd, 'minute');
      if (gapBefore >= 0 && gapBefore < minRestMinutes) {
        return `${t('Rest violation')}: ${guardAssignment.day} ${guardAssignment.shiftLabel}`;
      }
      
      // Check if guard shift starts less than 8 hours after our time range ends
      const gapAfter = guardStart.diff(timeRangeEnd, 'minute');
      if (gapAfter >= 0 && gapAfter < minRestMinutes) {
        return `${t('Rest violation')}: ${guardAssignment.day} ${guardAssignment.shiftLabel}`;
      }
    }
    
    return null;
  };

  // Check for BW conflict
  const hasBWConflict = (personId: number): string | null => {
    const timeRangeStart = dayjs(timeRange.start);
    const timeRangeDay = timeRangeStart.format('YYYY-MM-DD');
    const timeRangeStartMinutes = timeRangeStart.hour() * 60 + timeRangeStart.minute();
    const timeRangeEnd = dayjs(timeRange.end);
    const timeRangeEndMinutes = timeRangeEnd.hour() * 60 + timeRangeEnd.minute();
    
    // Check if person is assigned to a BW slot on the same day that overlaps with this time range
    for (const bwAssignment of bwAssignments) {
      if (bwAssignment.personId !== personId) continue;
      if (bwAssignment.day !== timeRangeDay) continue;
      
      const slot = BW_SLOT_DEFINITIONS.find(s => s.id === bwAssignment.slotId);
      if (!slot) continue;
      
      const bwRange = getBwSlotRangeMinutes(slot);
      if (hasTimeOverlap(timeRangeStartMinutes, timeRangeEndMinutes, bwRange.start, bwRange.end)) {
        return `${t('BW conflict')}: ${slot.label}`;
      }
    }
    
    return null;
  };

  // Get detailed overlap message
  const getOverlapMessage = (personId: number): string | null => {
    const parseHHmm = (value: string | undefined, fallback: string) => {
      const str = (value || fallback).toString();
      const m = str.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return fallback;
      const h = Math.min(23, Math.max(0, Number(m[1])));
      const mm = Math.min(59, Math.max(0, Number(m[2])));
      return `${pad(h)}:${pad(mm)}`;
    };
    const kitchenShiftById = new Map((kitchenSettings?.shifts || []).map(s => [s.id, s]));

    const buildRangeFromDayTimes = (day: string, startHHmm: string, endHHmm: string): IsoRange => {
      const start = dayjs(`${day}T${startHHmm}:00`);
      let end = dayjs(`${day}T${endHHmm}:00`);
      if (!end.isAfter(start)) end = end.add(1, 'day');
      return { start: start.toISOString(), end: end.toISOString() };
    };

    const kitchenRangeFor = (day: string, shiftId: string): IsoRange | null => {
      const s = kitchenShiftById.get(shiftId);
      if (!s) return null;
      return buildRangeFromDayTimes(day, s.start, s.end);
    };

    const escortRangeFor = (day: string, shiftId: string): IsoRange | null => {
      if (shiftId === 'escort_1') return buildRangeFromDayTimes(day, '07:00', '10:30');
      if (shiftId === 'escort_2') return buildRangeFromDayTimes(day, '10:30', '14:00');
      if (shiftId === 'escort_3') return buildRangeFromDayTimes(day, '14:00', '17:00');
      if (shiftId === 'escort_4') return buildRangeFromDayTimes(day, '17:00', '19:00');
      return null;
    };

    const rasarRangeFor = (day: string, shiftId: string): IsoRange | null => {
      if (shiftId === 'rasar_1') return buildRangeFromDayTimes(day, '08:30', '11:30');
      if (shiftId === 'rasar_2') return buildRangeFromDayTimes(day, '13:30', '17:30');
      if (shiftId === 'rasar_3') return buildRangeFromDayTimes(day, '19:30', '20:30');
      return null;
    };

    const escort400RangeFor = (day: string, shiftId: string): IsoRange | null => {
      if (shiftId === 'escort400_1') return buildRangeFromDayTimes(day, '08:00', '12:30');
      if (shiftId === 'escort400_2') return buildRangeFromDayTimes(day, '12:30', '17:00');
      return null;
    };

    // Find which type of assignment is overlapping (excluding the current assignment being edited)
    for (const a of guardAssignments) {
      if (a.personId !== personId) continue;
      const guardRange = getGuardAssignmentIsoRange(a);
      if (guardRange && overlaps(guardRange, timeRange)) {
        // Use the label as the source of truth (matches the guards table exactly).
        // Only fall back to formatting computed ISO times if the label is missing.
        const hhmm = a.shiftLabel || formatRangeHHmm(guardRange) || '';
        return `${t('Overlapping shift in this timeframe')}: ${t('Guards')} ${a.day} ${hhmm}`.trim();
      }
    }
    
    for (const k of kitchenAssignments) {
      if (k.personId !== personId) continue;
      // Exclude the current assignment being edited
      if (currentDay && currentShiftId && k.day === currentDay && k.shiftId === currentShiftId) continue;
      const kitchenRange = (k.start && k.end) ? { start: k.start, end: k.end } : kitchenRangeFor(k.day, k.shiftId);
      if (kitchenRange && overlaps(kitchenRange, timeRange)) {
        const hhmm = formatRangeHHmm(kitchenRange) || k.shiftId;
        return `${t('Overlapping shift in this timeframe')}: ${t('Kitchen')} ${k.day} ${hhmm}`;
      }
    }
    
    for (const e of escortAssignments) {
      if (e.personId !== personId) continue;
      // Exclude the current assignment being edited
      if (currentDay && currentShiftId && e.day === currentDay && e.shiftId === currentShiftId) continue;
      const escortRange = (e.start && e.end) ? { start: e.start, end: e.end } : escortRangeFor(e.day, e.shiftId);
      if (escortRange && overlaps(escortRange, timeRange)) {
        return `${t('Overlapping shift in this timeframe')}: Escort ${e.day} ${t(e.shiftId)}`;
      }
    }

    for (const r of rasarAssignments) {
      if (r.personId !== personId) continue;
      if (currentDay && currentShiftId && r.day === currentDay && r.shiftId === currentShiftId) continue;
      const rRange = (r.start && r.end) ? { start: r.start, end: r.end } : rasarRangeFor(r.day, r.shiftId);
      if (rRange && overlaps(rRange, timeRange)) {
        return `${t('Overlapping shift in this timeframe')}: ${t('Rasar')} ${r.day} ${r.shiftId}`;
      }
    }

    for (const e400 of escort400Assignments) {
      if (e400.personId !== personId) continue;
      if (currentDay && currentShiftId && e400.day === currentDay && e400.shiftId === currentShiftId) continue;
      const eRange = (e400.start && e400.end) ? { start: e400.start, end: e400.end } : escort400RangeFor(e400.day, e400.shiftId);
      if (eRange && overlaps(eRange, timeRange)) {
        return `${t('Overlapping shift in this timeframe')}: ${t('Contractor escort - 400')} ${e400.day} ${e400.shiftId}`;
      }
    }
    
    return null;
  };

  const togglePerson = (personId: number) => {
    setSelected(prev => {
      if (prev.includes(personId)) return prev.filter(id => id !== personId);
      if (prev.length >= requiredCount) return prev;
      return [...prev, personId];
    });
  };

  // Count violations for sorting
  const getViolationCount = (personId: number): number => {
    let count = 0;
    if (ineligiblePersonIds.includes(personId)) count++;
    const personConstraints = constraintsMap.get(personId) || [];
    if (listHasOverlap(personConstraints, timeRange)) count++;
    if (enableRestViolation && hasRestViolation(personId)) count++;
    if (hasBWConflict(personId)) count++;
    if (getOverlapMessage(personId)) count++;
    return count;
  };

  const filteredPeople = people
    .filter(p => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // Sort by violation count first (fewer violations first)
      const violationDiff = getViolationCount(a.id) - getViolationCount(b.id);
      if (violationDiff !== 0) return violationDiff;
      // Then by name
      return a.name.localeCompare(b.name);
    });

  const countsRangeStart = dutyCountRangeStartISO || scheduleStart || timeRange.start;
  const countsRangeEnd = dutyCountRangeEndISO || scheduleEnd || timeRange.end;

  const dutyCountsByPerson = useMemo(
    () =>
      buildDutyCountsByPerson({
        people,
        rangeStartISO: countsRangeStart,
        rangeEndISO: countsRangeEnd,
        guardAssignments,
        bwAssignments,
        kitchenAssignments,
        escortAssignments,
        rasarAssignments,
        escort400Assignments,
      }),
    [
      people,
      countsRangeStart,
      countsRangeEnd,
      guardAssignments,
      bwAssignments,
      kitchenAssignments,
      escortAssignments,
      rasarAssignments,
      escort400Assignments,
    ]
  );

  const tooltipForPerson = (person: Person) => {
    const c = dutyCountsByPerson.get(person.id);
    const lines: Array<{ label: string; count: number }> = [];
    if (c?.guards) lines.push({ label: t('Guards'), count: c.guards });
    if (c?.bw) lines.push({ label: t('BW Assignments'), count: c.bw });
    if (c?.kitchen) lines.push({ label: t('Kitchen'), count: c.kitchen });
    if (c?.escort) lines.push({ label: t('Escort'), count: c.escort });
    if (c?.rasar) lines.push({ label: t('Rasar'), count: c.rasar });
    if (c?.escort400) lines.push({ label: t('Contractor escort - 400'), count: c.escort400 });

    return (
      <Box sx={{ whiteSpace: 'pre-line' }}>
        <Typography variant="subtitle2">{person.name}</Typography>
        <Box sx={{ height: 8 }} />
        {lines.length === 0 ? (
          <Typography variant="body2">{t('No duties in range')}</Typography>
        ) : (
          lines.map(l => (
            <Typography key={l.label} variant="body2">
              {l.label}: {l.count}
            </Typography>
          ))
        )}
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {subtitle}
          </Typography>
        )}
        <Typography
          variant="body2"
          color={selected.length >= requiredCount ? 'success.main' : 'warning.main'}
          sx={{ mb: 2 }}
        >
          {t('Selected')}: {selected.length} / {requiredCount}
        </Typography>
        <TextField
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('Search people')}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />
        <Box sx={{ maxHeight: 360, overflowY: 'auto', pr: 1 }}>
          {filteredPeople.map(person => {
            const isSelected = selected.includes(person.id);
            const disabledByCount = !isSelected && selected.length >= requiredCount;
            const personConstraints = constraintsMap.get(person.id) || [];
            const hasConstraintConflict = listHasOverlap(personConstraints, timeRange);
            const restViolation = enableRestViolation ? hasRestViolation(person.id) : null;
            const bwConflict = hasBWConflict(person.id);
            const overlapMessage = getOverlapMessage(person.id);
            const isIneligible = ineligiblePersonIds.includes(person.id);
            
            // Do not disable selection for overlaps/constraints/rest/BW; only enforce max count.
            const disabled = !isSelected && disabledByCount;

            return (
              <Box key={person.id} sx={{ mb: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isSelected}
                      onChange={() => togglePerson(person.id)}
                      disabled={disabled}
                    />
                  }
                  label={
                    <Tooltip title={tooltipForPerson(person)} placement="top" arrow>
                      <span>{person.name}</span>
                    </Tooltip>
                  }
                  sx={{ opacity: disabled ? 0.5 : 1 }}
                />
                {hasConstraintConflict && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                    ⚠️ {t('Constraint conflict')}
                  </Typography>
                )}
                {isIneligible && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                    ⚠️ {ineligibleReasonLabel || t('Schedule is invalid')}
                  </Typography>
                )}
                {overlapMessage && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                    ⚠️ {overlapMessage}
                  </Typography>
                )}
                {restViolation && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                    ⚠️ {restViolation}
                  </Typography>
                )}
                {bwConflict && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                    ⚠️ {bwConflict}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button onClick={() => { onSave(selected); onClose(); }} variant="contained">
          {t('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DutyEditDialog;


