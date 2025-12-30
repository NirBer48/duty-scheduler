import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Button,
  Typography,
  Stack,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditIcon from '@mui/icons-material/Edit';
import SettingsIcon from '@mui/icons-material/Settings';
import { useI18n } from '../util/i18n';
import type { Constraint, Person, RasarAssignment, RasarOverride, Escort400Assignment, Escort400Override } from '../types';
import DutyEditDialog from './schedule/DutyEditDialog';
import { DutyShiftSettingsDialog } from './schedule/DutyShiftSettingsDialog';
import { exportRasarToExcel } from './schedule/excelExport';

type Props = {
  people: Person[];
  rasarAssignments: RasarAssignment[];
  onRasarAssignmentsChange: (a: RasarAssignment[]) => void;
  rasarOverrides: RasarOverride[];
  onRasarOverridesChange: (o: RasarOverride[]) => void;
  escort400Assignments: Escort400Assignment[];
  onEscort400AssignmentsChange: (a: Escort400Assignment[]) => void;
  escort400Overrides: Escort400Override[];
  onEscort400OverridesChange: (o: Escort400Override[]) => void;
  constraints: Constraint[];
  onGenerate: (
    startISO: string,
    endISO: string,
    existing: RasarAssignment[],
    overrides: RasarOverride[]
  ) => void;
  onGenerateEscort400: (
    startISO: string,
    endISO: string,
    existing: Escort400Assignment[],
    overrides: Escort400Override[]
  ) => void;
  onSave: () => void;
  onClear: () => void;
  onAddConstraint: () => void;
  isGenerating?: boolean;
  readOnly?: boolean;
};

const RASAR_SHIFTS = [
  { id: 'rasar_1', label: '08:30-11:30', start: '08:30', end: '11:30' },
  { id: 'rasar_2', label: '13:30-17:30', start: '13:30', end: '17:30' },
  { id: 'rasar_3', label: '19:30-20:30', start: '19:30', end: '20:30' },
];

const ESCORT400_SHIFTS = [
  { id: 'escort400_1', label: '08:00-12:30', start: '08:00', end: '12:30' },
  { id: 'escort400_2', label: '12:30-17:00', start: '12:30', end: '17:00' },
];

const DAY_NAMES_HE = ['א', 'ב', 'ג', 'ד', 'ה'];
const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'];

// Always anchor weeks to Sunday (not locale-dependent).
const getSunday = (d: dayjs.Dayjs) => d.day(0).startOf('day');

const overlaps = (aStartISO: string, aEndISO: string, bStartISO: string, bEndISO: string) => {
  const aStart = dayjs(aStartISO).second(0).millisecond(0);
  const aEnd = dayjs(aEndISO).second(0).millisecond(0);
  const bStart = dayjs(bStartISO).second(0).millisecond(0);
  const bEnd = dayjs(bEndISO).second(0).millisecond(0);
  return aStart.isBefore(bEnd) && bStart.isBefore(aEnd);
};

const RasarDutyView: React.FC<Props> = ({
  people,
  rasarAssignments,
  onRasarAssignmentsChange,
  rasarOverrides,
  onRasarOverridesChange,
  escort400Assignments,
  onEscort400AssignmentsChange,
  escort400Overrides,
  onEscort400OverridesChange,
  constraints,
  onGenerate,
  onGenerateEscort400,
  onSave,
  onClear,
  onAddConstraint,
  isGenerating = false,
  readOnly = false,
}) => {
  const { t, lang } = useI18n();
  const [weekAnchor, setWeekAnchor] = useState(() => getSunday(dayjs()));
  const weekStart = useMemo(() => getSunday(weekAnchor), [weekAnchor]);
  const weekEndDisplay = useMemo(() => weekStart.add(4, 'day'), [weekStart]);

  // IMPORTANT: send local datetime strings (no trailing Z) so the server won't shift days by timezone.
  const apiStart = useMemo(() => weekStart.format('YYYY-MM-DDT00:00'), [weekStart]);
  const apiEnd = useMemo(() => weekStart.add(5, 'day').format('YYYY-MM-DDT00:00'), [weekStart]); // Fri 00:00

  const days = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < 5; i++) {
      arr.push(weekStart.add(i, 'day').format('YYYY-MM-DD'));
    }
    return arr;
  }, [weekStart]);

  const prevWeek = () => setWeekAnchor((w) => w.subtract(7, 'day'));
  const nextWeek = () => setWeekAnchor((w) => w.add(7, 'day'));

  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    day: string;
    shiftId: string;
    personIds: number[];
  }>({ open: false, day: '', shiftId: '', personIds: [] });

  const [settingsDialog, setSettingsDialog] = useState<{
    open: boolean;
    day: string;
    shiftId: string;
  }>({ open: false, day: '', shiftId: '' });

  const getRequired = (day: string, shiftId: string) => {
    const o = rasarOverrides.find(x => x.day === day && x.shiftId === shiftId);
    const v = Number(o?.required ?? 1);
    return Number.isFinite(v) ? Math.max(0, v) : 1;
  };

  const getRequired400 = (day: string, shiftId: string) => {
    const o = escort400Overrides.find(x => x.day === day && x.shiftId === shiftId);
    const v = Number(o?.required ?? 1);
    return Number.isFinite(v) ? Math.max(0, v) : 1;
  };

  const getPersonIds = (day: string, shiftId: string) =>
    rasarAssignments.filter((a) => a.day === day && a.shiftId === shiftId).map((a) => a.personId);

  const getPersonIds400 = (day: string, shiftId: string) =>
    escort400Assignments.filter((a) => a.day === day && a.shiftId === shiftId).map((a) => a.personId);

  const getNames = (ids: number[]) =>
    ids.map((pid) => people.find((p) => p.id === pid)?.name || String(pid)).join(', ');

  const openEdit = (day: string, shiftId: string) => {
    setEditDialog({ open: true, day, shiftId, personIds: getPersonIds(day, shiftId) });
  };

  const handleSave = (personIds: number[]) => {
    const { day, shiftId } = editDialog;
    const filtered = rasarAssignments.filter((a) => !(a.day === day && a.shiftId === shiftId));
    // Keep payload minimal & timezone-safe: day/shiftId/personId is enough for server persistence.
    const newAssignments = personIds.map((pid) => ({ day, shiftId, personId: pid }));
    onRasarAssignmentsChange([...filtered, ...newAssignments]);
    setEditDialog({ ...editDialog, open: false });
  };

  const [editDialog400, setEditDialog400] = useState<{
    open: boolean;
    day: string;
    shiftId: string;
    personIds: number[];
  }>({ open: false, day: '', shiftId: '', personIds: [] });

  const [settingsDialog400, setSettingsDialog400] = useState<{
    open: boolean;
    day: string;
    shiftId: string;
  }>({ open: false, day: '', shiftId: '' });

  const openEdit400 = (day: string, shiftId: string) => {
    setEditDialog400({ open: true, day, shiftId, personIds: getPersonIds400(day, shiftId) });
  };

  const handleSave400 = (personIds: number[]) => {
    const { day, shiftId } = editDialog400;
    const filtered = escort400Assignments.filter((a) => !(a.day === day && a.shiftId === shiftId));
    const newAssignments = personIds.map((pid) => ({ day, shiftId, personId: pid }));
    onEscort400AssignmentsChange([...filtered, ...newAssignments]);
    setEditDialog400({ ...editDialog400, open: false });
  };

  const buildTimeRange = (day: string, shiftId: string) => {
    const shiftDef = RASAR_SHIFTS.find((s) => s.id === shiftId);
    if (!shiftDef) return { start: '', end: '' };
    const start = `${day}T${shiftDef.start}`;
    const end = `${day}T${shiftDef.end}`;
    return { start, end };
  };

  const buildTimeRange400 = (day: string, shiftId: string) => {
    const shiftDef = ESCORT400_SHIFTS.find((s) => s.id === shiftId);
    if (!shiftDef) return { start: '', end: '' };
    const start = `${day}T${shiftDef.start}`;
    const end = `${day}T${shiftDef.end}`;
    return { start, end };
  };

  const validation = useMemo(() => {
    const invalidCells = new Set<string>();
    const issues: string[] = [];

    for (const day of days) {
      for (const shift of RASAR_SHIFTS) {
        const key = `${day}|${shift.id}`;
        const assigned = getPersonIds(day, shift.id);
        const required = getRequired(day, shift.id);
        if (assigned.length !== required) {
          invalidCells.add(key);
          issues.push(`${day} ${shift.label}: ${t('Required')} ${required}, ${t('has')} ${assigned.length}`);
        }

        if (assigned.length > 0) {
          const range = buildTimeRange(day, shift.id);
          for (const pid of assigned) {
            for (const c of constraints) {
              if (c.personId !== pid) continue;
              if (overlaps(range.start, range.end, c.startISO, c.endISO)) {
                invalidCells.add(key);
                const name = people.find(p => p.id === pid)?.name || String(pid);
                issues.push(`${name}: ${t('Constraint conflict')} (${day} ${shift.label})`);
                break;
              }
            }
          }
        }
      }
    }

    for (const day of days) {
      for (const shift of ESCORT400_SHIFTS) {
        const key = `400|${day}|${shift.id}`;
        const assigned = getPersonIds400(day, shift.id);
        const required = getRequired400(day, shift.id);
        if (assigned.length !== required) {
          invalidCells.add(key);
          issues.push(`${day} ${shift.label}: ${t('Required')} ${required}, ${t('has')} ${assigned.length}`);
        }
        if (assigned.length > 0) {
          const range = buildTimeRange400(day, shift.id);
          for (const pid of assigned) {
            const person = people.find(p => p.id === pid);
            if (person && person.gender !== 'F') {
              invalidCells.add(key);
              issues.push(`${person.name}: ${t('Schedule is invalid')} (${day} ${shift.label})`);
            }
            for (const c of constraints) {
              if (c.personId !== pid) continue;
              if (overlaps(range.start, range.end, c.startISO, c.endISO)) {
                invalidCells.add(key);
                const name = people.find(p => p.id === pid)?.name || String(pid);
                issues.push(`${name}: ${t('Constraint conflict')} (${day} ${shift.label})`);
                break;
              }
            }
          }
        }
      }
    }

    return { invalidCells, issues };
  }, [days, rasarAssignments, rasarOverrides, escort400Assignments, escort400Overrides, constraints, people]);

  const dayNames = lang === 'he' ? DAY_NAMES_HE : DAY_NAMES_EN;

  const exportWeek = () => {
    const weekStartDay = weekStart.format('YYYY-MM-DD');
    const daysSet = new Set(days);
    exportRasarToExcel({
      people,
      rasarAssignments: rasarAssignments.filter(a => daysSet.has(a.day)),
      rasarOverrides: rasarOverrides.filter(o => daysSet.has(o.day)),
      escort400Assignments: escort400Assignments.filter(a => daysSet.has(a.day)),
      escort400Overrides: escort400Overrides.filter(o => daysSet.has(o.day)),
      weekStart: weekStartDay,
      t,
    });
  };

  return (
    <Box>
      {/* Week navigation */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <IconButton onClick={prevWeek} disabled={isGenerating}>
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="h6">
          {weekStart.format('DD/MM/YYYY')} – {weekEndDisplay.format('DD/MM/YYYY')}
        </Typography>
        <IconButton onClick={nextWeek} disabled={isGenerating}>
          <ChevronRightIcon />
        </IconButton>
        {!readOnly && (
          <>
            <Button
              variant="contained"
              onClick={() =>
                onGenerate(apiStart, apiEnd, rasarAssignments, rasarOverrides)
              }
              disabled={isGenerating}
            >
              {isGenerating ? <CircularProgress size={20} /> : t('Generate')}
            </Button>
            <Button
              variant="contained"
              color="success"
              onClick={onSave}
              disabled={isGenerating || validation.issues.length > 0}
            >
              {t('Save')}
            </Button>
            <Button variant="outlined" onClick={exportWeek} disabled={isGenerating}>
              {t('Export to Excel')}
            </Button>
            <Button variant="outlined" onClick={onAddConstraint} disabled={isGenerating}>
              {t('Add Constraint')}
            </Button>
            <Button variant="outlined" color="error" onClick={onClear} disabled={isGenerating}>
              {t('Clear')}
            </Button>
          </>
        )}
      </Stack>

      {validation.issues.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('Schedule is invalid')} — {validation.issues.length}
        </Alert>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        {t('Rasar')}
      </Typography>

      {/* Table */}
      <Box sx={{ overflowX: 'auto' }}>
        <Box
          component="table"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            '& th, & td': {
              border: '1px solid',
              borderColor: 'divider',
              p: 1,
              textAlign: 'center',
              minWidth: 90,
            },
            '& th': { bgcolor: 'grey.100', fontWeight: 600 },
          }}
        >
          <thead>
            <tr>
              <th>{t('Shift')}</th>
              {days.map((d, idx) => (
                <th key={d}>
                  {dayNames[idx]}
                  <br />
                  <Typography variant="caption">{dayjs(d).format('DD/MM')}</Typography>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RASAR_SHIFTS.map((shift) => (
              <tr key={shift.id}>
                <td style={{ fontWeight: 500 }}>{shift.label}</td>
                {days.map((day) => {
                  const pids = getPersonIds(day, shift.id);
                  const names = getNames(pids);
                  const required = getRequired(day, shift.id);
                  const cellKey = `${day}|${shift.id}`;
                  const invalid = validation.invalidCells.has(cellKey);
                  return (
                    <td key={cellKey} style={invalid ? { border: '2px solid #f59e0b' } : undefined}>
                      <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                        <Typography variant="body2" noWrap>
                          {names || '—'}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.7 }}>
                          {pids.length}/{required}
                        </Typography>
                        {!readOnly && (
                          <IconButton size="small" onClick={() => openEdit(day, shift.id)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                        {!readOnly && (
                          <IconButton size="small" onClick={() => setSettingsDialog({ open: true, day, shiftId: shift.id })}>
                            <SettingsIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {t('Contractor escort - 400')}
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            component="table"
            sx={{
              width: '100%',
              borderCollapse: 'collapse',
              '& th, & td': {
                border: '1px solid',
                borderColor: 'divider',
                p: 1,
                textAlign: 'center',
                minWidth: 90,
              },
              '& th': { bgcolor: 'grey.100', fontWeight: 600 },
            }}
          >
            <thead>
              <tr>
                <th>{t('Shift')}</th>
                {days.map((d, idx) => (
                  <th key={d}>
                    {dayNames[idx]}
                    <br />
                    <Typography variant="caption">{dayjs(d).format('DD/MM')}</Typography>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ESCORT400_SHIFTS.map((shift) => (
                <tr key={shift.id}>
                  <td style={{ fontWeight: 500 }}>{shift.label}</td>
                  {days.map((day) => {
                    const pids = getPersonIds400(day, shift.id);
                    const names = getNames(pids);
                    const required = getRequired400(day, shift.id);
                    const cellKey = `400|${day}|${shift.id}`;
                    const invalid = validation.invalidCells.has(cellKey);
                    return (
                      <td key={cellKey} style={invalid ? { border: '2px solid #f59e0b' } : undefined}>
                        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                          <Typography variant="body2" noWrap>
                            {names || '—'}
                          </Typography>
                          <Typography variant="caption" sx={{ opacity: 0.7 }}>
                            {pids.length}/{required}
                          </Typography>
                          {!readOnly && (
                            <IconButton size="small" onClick={() => openEdit400(day, shift.id)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          )}
                          {!readOnly && (
                            <IconButton size="small" onClick={() => setSettingsDialog400({ open: true, day, shiftId: shift.id })}>
                              <SettingsIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Stack>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      </Box>

      {/* Edit Dialog */}
      <DutyEditDialog
        open={editDialog.open}
        onClose={() => setEditDialog({ ...editDialog, open: false })}
        title={`${t('Rasar')} — ${editDialog.day}`}
        subtitle={RASAR_SHIFTS.find((s) => s.id === editDialog.shiftId)?.label || ''}
        requiredCount={getRequired(editDialog.day, editDialog.shiftId) || 1}
        timeRange={buildTimeRange(editDialog.day, editDialog.shiftId)}
        people={people}
        currentPersonIds={editDialog.personIds}
        onSave={handleSave}
        constraints={constraints}
        guardAssignments={[]}
        bwAssignments={[]}
        kitchenAssignments={[]}
        escortAssignments={[]}
        currentDay={editDialog.day}
        currentShiftId={editDialog.shiftId}
      />

      <DutyEditDialog
        open={editDialog400.open}
        onClose={() => setEditDialog400({ ...editDialog400, open: false })}
        title={`ליווי קבלנים - 400 — ${editDialog400.day}`}
        subtitle={ESCORT400_SHIFTS.find((s) => s.id === editDialog400.shiftId)?.label || ''}
        requiredCount={getRequired400(editDialog400.day, editDialog400.shiftId) || 1}
        timeRange={buildTimeRange400(editDialog400.day, editDialog400.shiftId)}
        people={people.filter(p => p.gender === 'F')}
        currentPersonIds={editDialog400.personIds}
        onSave={handleSave400}
        constraints={constraints}
        guardAssignments={[]}
        bwAssignments={[]}
        kitchenAssignments={[]}
        escortAssignments={[]}
        currentDay={editDialog400.day}
        currentShiftId={editDialog400.shiftId}
      />

      <DutyShiftSettingsDialog
        open={settingsDialog.open}
        onClose={() => setSettingsDialog({ ...settingsDialog, open: false })}
        title={`${t('Rasar')} — ${settingsDialog.day}`}
        shiftLabel={RASAR_SHIFTS.find(s => s.id === settingsDialog.shiftId)?.label || settingsDialog.shiftId}
        currentRequired={getRequired(settingsDialog.day, settingsDialog.shiftId) || 1}
        onSave={(required) => {
          const day = settingsDialog.day;
          const shiftId = settingsDialog.shiftId;
          const next = rasarOverrides.filter(o => !(o.day === day && o.shiftId === shiftId));
          next.push({ day, shiftId, required });
          onRasarOverridesChange(next);
        }}
      />

      <DutyShiftSettingsDialog
        open={settingsDialog400.open}
        onClose={() => setSettingsDialog400({ ...settingsDialog400, open: false })}
        title={`ליווי קבלנים - 400 — ${settingsDialog400.day}`}
        shiftLabel={ESCORT400_SHIFTS.find(s => s.id === settingsDialog400.shiftId)?.label || settingsDialog400.shiftId}
        currentRequired={getRequired400(settingsDialog400.day, settingsDialog400.shiftId) || 1}
        onSave={(required) => {
          const day = settingsDialog400.day;
          const shiftId = settingsDialog400.shiftId;
          const next = escort400Overrides.filter(o => !(o.day === day && o.shiftId === shiftId));
          next.push({ day, shiftId, required });
          onEscort400OverridesChange(next);
        }}
      />
    </Box>
  );
};

export default RasarDutyView;

