import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  FormControlLabel,
  Switch,
  TextField,
  TableSortLabel,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { useI18n } from '../util/i18n';
import type { Assignment, BWAssignment, EscortAssignment, Escort400Assignment, KitchenAssignment, Person, RasarAssignment } from '../types';
import { fetchJustice, type JusticeRow } from '../api';

type Props = {
  people: Person[];
  startISO: string;
  endISO: string;
  assignments: Assignment[];
  bwAssignments: BWAssignment[];
  kitchenAssignments: KitchenAssignment[];
  escortAssignments: EscortAssignment[];
  rasarAssignments: RasarAssignment[];
  escort400Assignments: Escort400Assignment[];
};

const JusticeTableView: React.FC<Props> = ({
  people,
  startISO,
  endISO,
  // kept for backward compatibility but not used (server is source of truth for justice stats)
}) => {
  const { t, rtl } = useI18n();

  const [mode, setMode] = useState<'all' | 'range'>('all');
  const [fromDate, setFromDate] = useState<string>(() => (startISO || '').substring(0, 10));
  const [toDate, setToDate] = useState<string>(() => (endISO || '').substring(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [rows, setRows] = useState<JusticeRow[]>([]);

  const [orderBy, setOrderBy] = useState<keyof JusticeRow>('totalHours');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const params =
          mode === 'all'
            ? { mode: 'all' as const }
            : {
                mode: 'range' as const,
                startISO: `${fromDate}T00:00`,
                endISO: `${toDate}T23:59`,
              };
        const res = await fetchJustice(params);
        if (!cancelled) setRows(res.rows || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || t('Fetch failed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Guard: need valid dates when in range mode.
    if (mode === 'range' && (!fromDate || !toDate)) return;
    load();
    return () => {
      cancelled = true;
    };
  }, [mode, fromDate, toDate, t]);

  const fmt = (h: number) => {
    const v = Number(h || 0);
    if (Number.isNaN(v)) return '0';
    const s = v.toFixed(1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[orderBy];
      const bv = b[orderBy];
      if (typeof av === 'number' && typeof bv === 'number') {
        return order === 'asc' ? av - bv : bv - av;
      }
      const as = String(av ?? '');
      const bs = String(bv ?? '');
      return order === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return copy;
  }, [rows, orderBy, order]);

  const onSort = (k: keyof JusticeRow) => {
    if (orderBy === k) {
      setOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(k);
      setOrder('desc');
    }
  };

  const columns: Array<{ key: keyof JusticeRow; label: string; isNumeric?: boolean }> = [
    { key: 'name', label: t('Person') },
    { key: 'guardsHours', label: `${t('Guards')} (${t('Hours')})`, isNumeric: true },
    { key: 'bwHours', label: `BW (${t('Hours')})`, isNumeric: true },
    { key: 'kitchenHours', label: `${t('Kitchen')} (${t('Hours')})`, isNumeric: true },
    { key: 'escortHours', label: `${t('Escort')} (${t('Hours')})`, isNumeric: true },
    { key: 'rasarHours', label: `${t('Rasar')} (${t('Hours')})`, isNumeric: true },
    { key: 'escort400Hours', label: `400 (${t('Hours')})`, isNumeric: true },
    { key: 'totalHours', label: `${t('Total')} (${t('Hours')})`, isNumeric: true },
  ];

  return (
    <Box sx={{ width: '100%' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">{t('Justice Table')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {mode === 'all' ? t('All time') : `${fromDate} → ${toDate}`}
          </Typography>
        </Box>

        <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
          <FormControlLabel
            control={
              <Switch
                checked={mode === 'range'}
                onChange={(e) => setMode(e.target.checked ? 'range' : 'all')}
              />
            }
            label={mode === 'range' ? t('By date range') : t('All time')}
          />
          {mode === 'range' && (
            <>
              <TextField
                type="date"
                size="small"
                label={t('From')}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                type="date"
                size="small"
                label={t('To')}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </>
          )}
        </Stack>
      </Stack>

      {error && (
        <Typography color="error" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}

      <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader sx={{ direction: rtl ? 'rtl' : 'ltr' }}>
          <TableHead>
            <TableRow>
              {columns.map(col => (
                <TableCell
                  key={col.key}
                  align={col.isNumeric ? 'center' : 'inherit'}
                  sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}
                >
                  <TableSortLabel
                    active={orderBy === col.key}
                    direction={orderBy === col.key ? order : 'asc'}
                    onClick={() => onSort(col.key)}
                  >
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2">{t('Loading')}</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
            {!loading && sortedRows.map(r => (
              <TableRow key={r.personId} hover>
                <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {/* Name column first; in RTL this appears on the right as requested */}
                  {r.name || people.find(p => p.id === r.personId)?.name || String(r.personId)}
                </TableCell>
                <TableCell align="center">{fmt(r.guardsHours)}</TableCell>
                <TableCell align="center">{fmt(r.bwHours)}</TableCell>
                <TableCell align="center">{fmt(r.kitchenHours)}</TableCell>
                <TableCell align="center">{fmt(r.escortHours)}</TableCell>
                <TableCell align="center">{fmt(r.rasarHours)}</TableCell>
                <TableCell align="center">{fmt(r.escort400Hours)}</TableCell>
                <TableCell align="center" sx={{ fontWeight: 800 }}>
                  {fmt(r.totalHours)}
                </TableCell>
              </TableRow>
            ))}
            {!loading && sortedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length}>{t('No duties in range')}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default JusticeTableView;


