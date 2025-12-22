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
} from '@mui/material';
import { useI18n } from '../../util/i18n';
import type { Assignment, BWAssignment, Constraint, EscortAssignment, KitchenAssignment, Person } from '../../types';
import { BW_SLOT_DEFINITIONS } from './utils';

type IsoRange = { start: string; end: string };

const pad = (n: number) => String(n).padStart(2, '0');

const getGuardAssignmentIsoRange = (a: Assignment): IsoRange | null => {
  // If server already provided ISO, use it.
  if (a.start && a.end) return { start: a.start, end: a.end };
  // Otherwise derive from shiftLabel (HH:mm-HH:mm) and day.
  const m = (a.shiftLabel || '').match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return null;
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

const overlaps = (a: IsoRange, b: IsoRange) => dayjs(a.start).isBefore(b.end) && dayjs(b.start).isBefore(a.end);

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

    for (const a of guardAssignments) add(a.personId, getGuardAssignmentIsoRange(a));
    for (const bw of bwAssignments) add(bw.personId, getBwIsoRange(bw));
    for (const k of kitchenAssignments) {
      if (k.start && k.end) add(k.personId, { start: k.start, end: k.end });
    }
    for (const e of escortAssignments) {
      if (e.start && e.end) add(e.personId, { start: e.start, end: e.end });
    }
    return map;
  }, [guardAssignments, bwAssignments, kitchenAssignments, escortAssignments]);

  const togglePerson = (personId: number) => {
    setSelected(prev => {
      if (prev.includes(personId)) return prev.filter(id => id !== personId);
      if (prev.length >= requiredCount) return prev;
      return [...prev, personId];
    });
  };

  const filteredPeople = people
    .filter(p => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

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
            const otherRanges = otherDutyRangesByPerson.get(person.id) || [];
            const hasDutyOverlap = listHasOverlap(otherRanges, timeRange);
            // Enforce constraints/overlaps by disabling selection (but allow unselect)
            const disabled = !isSelected && (disabledByCount || hasConstraintConflict || hasDutyOverlap);

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
                  label={<span>{person.name}</span>}
                  sx={{ opacity: disabled ? 0.5 : 1 }}
                />
                {hasConstraintConflict && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                    {t('Constraint conflict')}
                  </Typography>
                )}
                {hasDutyOverlap && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', ml: 4 }}>
                    {t('Overlapping shift in this timeframe')}
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


