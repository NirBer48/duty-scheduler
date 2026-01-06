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
        { key: 'guardsHours', label: t('Guards'), isNumeric: true },
        { key: 'bwHours', label: t('BW Assignments'), isNumeric: true },
        { key: 'kitchenHours', label: t('Kitchen'), isNumeric: true },
        { key: 'escortHours', label: t('Escort'), isNumeric: true },
        { key: 'rasarHours', label: t('Rasar'), isNumeric: true },
        { key: 'escort400Hours', label: t('Contractor escort - 400'), isNumeric: true },
        { key: 'totalHours', label: `${t('Total')} (${t('Hours')})`, isNumeric: true },
    ];

    const totalRange = useMemo(() => {
        if (!rows.length) return { min: 0, max: 0 };
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (const r of rows) {
            const v = Number(r.totalHours || 0);
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 0 };
        return { min, max };
    }, [rows]);

    const rowBgForTotal = (total: number) => {
        const v = Number(total || 0);
        const { min, max } = totalRange;
        const denom = max - min;
        const t01 = denom <= 0 ? 1 : (v - min) / denom; // 0..1
        const hue = 120 * t01; // 0=red .. 120=green
        // Soft pastel palette, still readable.
        return `hsl(${hue.toFixed(0)}, 70%, 92%)`;
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: 2 }}>
                <Box>
                    <Typography variant="h3">{t('Justice Table')}</Typography>
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

            <TableContainer component={Paper} sx={{ overflowX: 'auto', border: '2px solid #333' }}>
                <Table
                    size="small"
                    stickyHeader
                    sx={{
                        // Force LTR so "Person" column being last renders on the right-most side.
                        direction: 'ltr',
                        fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif',
                        '& .MuiTableCell-root': {
                            fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif',
                            fontSize: '0.95rem',
                            border: '1px solid #ccc',
                        },
                        '& .MuiTableCell-head': {
                            fontSize: '1.0rem',
                            borderBottom: '2px solid #333',
                        },
                    }}
                >
                    <TableHead>
                        <TableRow>
                            {columns.map(col => (
                                <TableCell
                                    key={col.key}
                                    align='center'
                                    sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}
                                >
                                    <TableSortLabel
                                        active={orderBy === col.key}
                                        direction={orderBy === col.key ? order : 'asc'}
                                        onClick={() => onSort(col.key)}
                                        sx={{ fontSize: '1.5rem' }}
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
                        {!loading && sortedRows.map(r => {
                            const name = r.name || people.find(p => p.id === r.personId)?.name || String(r.personId);
                            const bg = rowBgForTotal(r.totalHours);
                            return (
                                <TableRow
                                    key={r.personId}
                                    hover
                                    sx={{
                                        backgroundColor: bg,
                                        '&:hover': { backgroundColor: bg }, // keep palette stable on hover
                                    }}
                                >
                                    <TableCell
                                        sx={{
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                            fontSize: '1.25rem',
                                        }}
                                    >
                                        {name}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '1.5rem' }} align="center">{fmt(r.guardsHours)}</TableCell>
                                    <TableCell sx={{ fontSize: '1.5rem' }} align="center">{fmt(r.bwHours)}</TableCell>
                                    <TableCell sx={{ fontSize: '1.5rem' }} align="center">{fmt(r.kitchenHours)}</TableCell>
                                    <TableCell sx={{ fontSize: '1.5rem' }} align="center">{fmt(r.escortHours)}</TableCell>
                                    <TableCell sx={{ fontSize: '1.5rem' }} align="center">{fmt(r.rasarHours)}</TableCell>
                                    <TableCell sx={{ fontSize: '1.5rem' }} align="center">{fmt(r.escort400Hours)}</TableCell>
                                    <TableCell sx={{ fontSize: '1.5rem', fontWeight: 800 }} align="center"> {fmt(r.totalHours)}</TableCell>
                                </TableRow>
                            );
                        })}
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


