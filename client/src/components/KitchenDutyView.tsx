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
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
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
  Person,
  ESGroupAssignment,
} from '../types';
import DutyEditDialog from './schedule/DutyEditDialog';
import { DutyShiftSettingsDialog } from './schedule/DutyShiftSettingsDialog';

type Props = {
  people: Person[];
  start: string;
  end: string;
  onStartChange?: (v: string) => void;
  onEndChange?: (v: string) => void;
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
  start,
  end,
  onStartChange,
  onEndChange,
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
  readOnly = false,
}) => {
  const { t, lang, rtl } = useI18n();
  const scheduleStart = useMemo(() => dayjs(start), [start]);
  const scheduleEnd = useMemo(() => dayjs(end), [end]);

  const kitchenShift2Start = clampShift2Start(parseHHmm(kitchenSettings.shift2Start, '13:00'));
  const kitchenShifts = useMemo(() => ([
    { id: 'kitchen_1', label: `06:00-${kitchenShift2Start}`, start: '06:00', end: kitchenShift2Start },
    { id: 'kitchen_2', label: `${kitchenShift2Start}-21:00`, start: kitchenShift2Start, end: '21:00' },
  ]), [kitchenShift2Start]);

  const escortShifts = useMemo(() => ([
    { id: 'escort_1', label: '07:00-10:30', start: '07:00', end: '10:30' },
    { id: 'escort_2', label: '10:30-14:00', start: '10:30', end: '14:00' },
    { id: 'escort_3', label: '14:00-17:00', start: '14:00', end: '17:00' },
    { id: 'escort_4', label: '17:00-19:00', start: '17:00', end: '19:00' },
  ]), []);

  const requiredForKitchenShift = (shiftId: string) => {
    if (shiftId === 'kitchen_1') return Math.max(0, Number(kitchenSettings.requiredShift1 ?? 36));
    if (shiftId === 'kitchen_2') return Math.max(0, Number(kitchenSettings.requiredShift2 ?? 36));
    return 0;
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

  const [dialog, setDialog] = useState<{
    open: boolean;
    type: 'kitchen' | 'escort';
    day: string;
    shiftId: string;
    label: string;
    range: { start: string; end: string } | null;
  }>({ open: false, type: 'kitchen', day: '', shiftId: '', label: '', range: null });

  const [saveError, setSaveError] = useState<string>('');
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    setSaveError('');
    try {
      const archiveS = archiveStart || start;
      const archiveE = archiveEnd || end;
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
      if (!res.ok) setSaveError(res.error || t('Save failed'));
    } catch (e: any) {
      setSaveError(e?.message || t('Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const kitchenTitle = lang === 'he' ? 'מטבח' : t('Kitchen');
  const escortTitle = 'ליווי קבלנים';

  const cellHeightKitchen = 120;
  const cellHeightEscort = 65;

  return (
    <Box>
      {!readOnly && (
        <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center" sx={{ mb: 2 }}>
          <TextField
            type="datetime-local"
            label={t('Start')}
            value={start}
            onChange={e => onStartChange?.(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 60 }}
            size="small"
          />
          <TextField
            type="datetime-local"
            label={t('End')}
            value={end}
            onChange={e => onEndChange?.(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 60 }}
            size="small"
          />
          {/* Per-shift required counts are editable in the Hours column for each row */}
          <TextField
            label={lang === 'he' ? 'תחילת משמרת שנייה (מטבח)' : 'Kitchen shift 2 start'}
            type="time"
            size="small"
            value={kitchenShift2Start}
            inputProps={{ min: '06:00', max: '20:59', step: 60 }}
            onChange={e => onKitchenSettingsChange({ ...kitchenSettings, shift2Start: clampShift2Start(e.target.value) })}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" onClick={onGenerate} disabled={saving}>
            {t('Generate')}
          </Button>
          <Button variant="outlined" color="error" onClick={onClear} disabled={saving}>
            {t('Clear')}
          </Button>
          <Button variant="outlined" onClick={onAddConstraint} disabled={saving}>
            {t('Add Constraint')}
          </Button>
          <Button
            variant="outlined"
            onClick={() => exportKitchenToExcel({
              people,
              kitchenAssignments,
              escortAssignments,
              kitchenSettings: { ...kitchenSettings, shift2Start: kitchenShift2Start },
              escortSettings,
              kitchenStart: start,
              kitchenEnd: end,
              t
            })}
            disabled={saving}
          >
            {t('Export to Excel')}
          </Button>
          <Button variant="contained" color="success" onClick={handleSave} disabled={saving}>
            {t('Save Schedule')}
          </Button>
        </Stack>
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
                <th style={{ border: '1px solid #888', background: '#f0f0f0', minWidth: 160, padding: '8px 4px' }}>
                  {t('Hours')}
                </th>
              )}
              {daysWithAnyKitchen.map(day => (
                <th key={day} style={{ border: '1px solid #888', background: '#f0f0f0', minWidth: 170, padding: '8px 4px' }}>
                  {day}
                </th>
              ))}
              {!rtl && (
                <th style={{ border: '1px solid #888', background: '#f0f0f0', minWidth: 160, padding: '8px 4px' }}>
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
                  const bg = personIds.length >= required ? '#e8f5e9' : personIds.length === 0 ? '#ffebee' : '#fff3e0';
                  return (
                    <td
                      key={`${day}|${shift.id}`}
                      onClick={() => !readOnly && openKitchenDialog(day, shift.id)}
                      style={{
                        border: '1px solid #ccc',
                        padding: 8,
                        cursor: readOnly ? 'default' : 'pointer',
                        backgroundColor: bg,
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
                <th style={{ border: '1px solid #888', background: '#f0f0f0', minWidth: 160, padding: '8px 4px' }}>
                  {t('Hours')}
                </th>
              )}
              {daysWithAnyEscort.map(day => (
                <th key={day} style={{ border: '1px solid #888', background: '#f0f0f0', minWidth: 170, padding: '8px 4px' }}>
                  {day}
                </th>
              ))}
              {!rtl && (
                <th style={{ border: '1px solid #888', background: '#f0f0f0', minWidth: 160, padding: '8px 4px' }}>
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
                  const bg = personIds.length >= required ? '#e8f5e9' : personIds.length === 0 ? '#ffebee' : '#fff3e0';
                  return (
                    <td
                      key={`${day}|${shift.id}`}
                      onClick={() => !readOnly && openEscortDialog(day, shift.id)}
                      style={{
                        border: '1px solid #ccc',
                        padding: 8,
                        cursor: readOnly ? 'default' : 'pointer',
                        backgroundColor: bg,
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
          onSave={(required) => {
            if (shiftSettingsDialog.type === 'kitchen') {
              if (shiftSettingsDialog.shiftId === 'kitchen_1') onKitchenSettingsChange({ ...kitchenSettings, requiredShift1: required });
              if (shiftSettingsDialog.shiftId === 'kitchen_2') onKitchenSettingsChange({ ...kitchenSettings, requiredShift2: required });
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
        />
      )}
    </Box>
  );
};

export default KitchenDutyView;



