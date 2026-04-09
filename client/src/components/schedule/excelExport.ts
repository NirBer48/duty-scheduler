import XLSX from 'xlsx-js-style';
import dayjs from "dayjs";
import {
    Person,
    Post,
    Assignment,
    ESGroup,
    ESGroupAssignment,
    ShiftOverride,
    BWAssignment,
    KitchenAssignment,
    EscortAssignment,
    KitchenSettings,
    EscortSettings,
    RasarAssignment,
    RasarOverride,
} from "../../types";
import { ShiftSlot, getPersonIds, BW_SLOT_DEFINITIONS, BW_REQUIRED_PER_SLOT, getBwDaysForRange, getBwSlotsForRange, getShiftTimeWindow } from "./utils";

interface ExportParams {
    shifts: ShiftSlot[];
    posts: Post[];
    people: Person[];
    assignments: Assignment[];
    esGroups: ESGroup[];
    esAssignments: ESGroupAssignment[];
    shiftOverrides: ShiftOverride[];
    bwAssignments: BWAssignment[];
    start: string;
    end: string;
    t: (key: string) => string;
}

type KitchenExportParams = {
    people: Person[];
    kitchenAssignments: KitchenAssignment[];
    escortAssignments: EscortAssignment[];
    kitchenSettings: KitchenSettings;
    escortSettings: EscortSettings;
    kitchenStart: string;
    kitchenEnd: string;
    t: (key: string) => string;
};

type RasarExportParams = {
    people: Person[];
    rasarAssignments: RasarAssignment[];
    rasarOverrides: RasarOverride[];
    escort400Assignments: { day: string; shiftId: string; personId: number }[];
    escort400Overrides: { day: string; shiftId: string; required: number }[];
    weekStart: string; // YYYY-MM-DD (Sunday)
    t: (key: string) => string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const hhmmToMinutes = (hhmm: string) => {
    const m = (hhmm || '').match(/^(\d{2}):(\d{2})$/);
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
};
const clampKitchenShift2Start = (hhmm: string) => {
    // Keep it within 06:00..20:59 so we still have a non-empty 2nd shift (ends 21:00)
    const min = 6 * 60;
    const max = 20 * 60 + 59;
    const mins = hhmmToMinutes(hhmm);
    const clamped = Math.min(max, Math.max(min, mins));
    const hh = Math.floor(clamped / 60);
    const mm = clamped % 60;
    return `${pad2(hh)}:${pad2(mm)}`;
};

const listDays = (startISO: string, endISO: string) => {
    const start = dayjs(startISO);
    const end = dayjs(endISO);
    const out: string[] = [];
    let cursor = start.startOf('day');
    const last = end.startOf('day');
    while (cursor.isBefore(last) || cursor.isSame(last, 'day')) {
        out.push(cursor.format('YYYY-MM-DD'));
        cursor = cursor.add(1, 'day');
    }
    return out;
};

const getNamesMultiline = (people: Person[], personIds: number[]) =>
    personIds.map(pid => people.find(p => p.id === pid)?.name || String(pid)).join("\n");

export const exportKitchenToExcel = ({
    people,
    kitchenAssignments,
    escortAssignments,
    kitchenSettings,
    escortSettings,
    kitchenStart,
    kitchenEnd,
    t
}: KitchenExportParams) => {
    const wb = XLSX.utils.book_new();
    const startDt = dayjs(kitchenStart);
    const endDt = dayjs(kitchenEnd);
    const days = listDays(kitchenStart, kitchenEnd);

    const kitchenShifts = (kitchenSettings?.shifts && kitchenSettings.shifts.length > 0
      ? kitchenSettings.shifts
      : [{ id: 'default', start: '06:00', end: '21:00', required: 36 }]
    ).map(s => ({
      id: s.id,
      label: `${String(s.start || '06:00')}-${String(s.end || '21:00')}`,
      required: Number(s.required ?? 36),
    }));
    const escortShifts = [
        { id: 'escort_1', label: '07:00-10:30', required: Number(escortSettings.requiredShift1 ?? 4) },
        { id: 'escort_2', label: '10:30-14:00', required: Number(escortSettings.requiredShift2 ?? 4) },
        { id: 'escort_3', label: '14:00-17:00', required: Number(escortSettings.requiredShift3 ?? 4) },
        { id: 'escort_4', label: '17:00-19:00', required: Number(escortSettings.requiredShift4 ?? 4) },
    ];

    const buildSheet = (
        sheetName: string,
        shifts: { id: string; label: string; required: number }[],
        assignments: { day: string; shiftId: string; personId: number }[],
    ) => {
        const wsData: XLSX.CellObject[][] = [];
        const merges: XLSX.Range[] = [];
        // Each day spans a fixed 10 columns, but the shift/day data is a single merged cell.
        // Names are shown in ONE long row (comma-separated), like the BW export.
        const colsPerDay = 10;
        const rowHeights: { hpt?: number }[] = [];

        // Columns: days..., Hours (right-most)
        const headerRow: XLSX.CellObject[] = [
            ...days.flatMap((day, dayIdx) => {
                const startCol = dayIdx * colsPerDay;
                const endCol = startCol + colsPerDay - 1;
                merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: endCol } });
                const first: XLSX.CellObject = {
                    v: day,
                    t: 's',
                    s: {
                        font: { bold: true, color: { rgb: 'FFFFFF' } },
                        fill: { fgColor: { rgb: '4472C4' } },
                        alignment: { horizontal: 'center', vertical: 'center' },
                        border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                    }
                };
                const rest: XLSX.CellObject[] = [];
                for (let i = 1; i < colsPerDay; i++) {
                    rest.push({
                        v: '',
                        t: 's',
                        s: {
                            fill: { fgColor: { rgb: '4472C4' } },
                            border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                        }
                    });
                }
                return [first, ...rest];
            }),
            {
                v: t('Hours'),
                t: 's',
                s: {
                    font: { bold: true, color: { rgb: 'FFFFFF' } },
                    fill: { fgColor: { rgb: '5B9BD5' } },
                    alignment: { horizontal: 'center', vertical: 'center' },
                    border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                }
            }
        ];
        wsData.push(headerRow);
        rowHeights.push({ hpt: 24 });

        shifts.forEach((shift, shiftIdx) => {
            const row: XLSX.CellObject[] = [];
            let maxLinesForRow = 1;
            days.forEach((day, dayIdx) => {
                const personIds = assignments.filter(a => a.day === day && a.shiftId === shift.id).map(a => a.personId);
                const count = personIds.length;
                const names = personIds
                    .map(pid => people.find(p => p.id === pid)?.name || String(pid))
                    .sort((a, b) => a.localeCompare(b))
                    .join(', ');

                let bgColor = 'FFF2CC';
                if (count === 0) bgColor = 'FFCCCC';
                else if (count >= shift.required) bgColor = 'C6EFCE';

                const r = 1 + shiftIdx;
                const startCol = dayIdx * colsPerDay;
                const endCol = startCol + colsPerDay - 1;
                merges.push({ s: { r, c: startCol }, e: { r, c: endCol } });

                // Estimate how many wrapped lines are needed to show the full string.
                // This is approximate but works well with fixed-width day blocks.
                const charsPerLine = colsPerDay * 8; // matches `wch: 8` below
                const neededLines = Math.max(1, Math.ceil((names || '-').length / charsPerLine));
                if (neededLines > maxLinesForRow) maxLinesForRow = neededLines;

                // First col of the merged region holds the content.
                row.push({
                    v: names || '-',
                    t: 's',
                    s: {
                        font: { sz: 10 },
                        fill: { fgColor: { rgb: bgColor } },
                        alignment: { horizontal: 'center', vertical: 'top', wrapText: true },
                        border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                    }
                });
                // The rest of the merged region cells are empty but styled.
                for (let i = 1; i < colsPerDay; i++) {
                    row.push({
                        v: '',
                        t: 's',
                        s: {
                            fill: { fgColor: { rgb: bgColor } },
                            border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                        }
                    });
                }
            });
            row.push({
                v: shift.label,
                t: 's',
                s: {
                    font: { bold: true },
                    fill: { fgColor: { rgb: 'D9E2F3' } },
                    alignment: { horizontal: 'center', vertical: 'center' },
                    border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                }
            });
            wsData.push(row);
            // Roughly 14pt per line + a bit of padding
            rowHeights.push({ hpt: Math.min(300, 16 + maxLinesForRow * 14) });
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData.map(r => r.map(c => c.v)));
        wsData.forEach((row, r) => row.forEach((cell, c) => {
            const ref = XLSX.utils.encode_cell({ r, c });
            if (ws[ref]) ws[ref].s = cell.s;
        }));

        ws['!merges'] = merges;
        ws['!cols'] = [
            ...days.flatMap(() => Array.from({ length: colsPerDay }, () => ({ wch: 8 }))),
            { wch: 18 }, // Hours column
        ];
        ws['!rows'] = rowHeights;

        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    // Hebrew sheet names as requested
    buildSheet('מטבח', kitchenShifts, kitchenAssignments);
    buildSheet('ליווי', escortShifts, escortAssignments);

    XLSX.writeFile(wb, `kitchen_${startDt.format('YYYY-MM-DD')}_to_${endDt.format('YYYY-MM-DD')}.xlsx`);
};

export const exportRasarToExcel = ({
    people,
    rasarAssignments,
    rasarOverrides,
    escort400Assignments,
    escort400Overrides,
    weekStart,
    t,
}: RasarExportParams) => {
    const wb = XLSX.utils.book_new();
    const base = dayjs(weekStart).startOf('day');
    const days = Array.from({ length: 5 }, (_, i) => base.add(i, 'day').format('YYYY-MM-DD'));

    const styleHeader = (bg: string) => ({
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
        }
    });
    const styleCell = (bg: string) => ({
        font: { sz: 10 },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: 'center', vertical: 'top', wrapText: true },
        border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
        }
    });

    const buildSheet = (
        sheetName: string,
        title: string,
        shifts: { id: string; label: string }[],
        assignments: { day: string; shiftId: string; personId: number }[],
        overrides: { day: string; shiftId: string; required: number }[]
    ) => {
        const requiredFor = (day: string, shiftId: string) => {
            const o = overrides.find(x => x.day === day && x.shiftId === shiftId);
            const v = Number(o?.required ?? 1);
            return Number.isFinite(v) ? Math.max(0, v) : 1;
        };

        const wsData: XLSX.CellObject[][] = [];
        const header: XLSX.CellObject[] = [
            { v: title, t: 's', s: styleHeader('4472C4') },
            ...days.map(d => ({ v: d, t: 's', s: styleHeader('4472C4') })),
            { v: t('Hours'), t: 's', s: styleHeader('5B9BD5') },
        ];
        wsData.push(header);

        for (const shift of shifts) {
            const row: XLSX.CellObject[] = [];
            row.push({ v: shift.label, t: 's', s: styleCell('D9E2F3') });
            for (const day of days) {
                const personIds = assignments.filter(a => a.day === day && a.shiftId === shift.id).map(a => a.personId);
                const names = personIds
                    .map(pid => people.find(p => p.id === pid)?.name || String(pid))
                    .join('\n') || '-';
                const required = requiredFor(day, shift.id);
                const count = personIds.length;
                let bg = 'FFF2CC'; // partial
                if (required === 0) bg = 'D9D9D9';
                else if (count === 0) bg = 'FFCCCC';
                else if (count >= required) bg = 'C6EFCE';
                row.push({ v: names, t: 's', s: styleCell(bg) });
            }
            row.push({ v: shift.label, t: 's', s: styleCell('D9E2F3') });
            wsData.push(row);
        }

        const ws = XLSX.utils.aoa_to_sheet(wsData.map(r => r.map(c => c.v)));
        wsData.forEach((row, r) => row.forEach((cell, c) => {
            const ref = XLSX.utils.encode_cell({ r, c });
            if (ws[ref]) ws[ref].s = cell.s;
        }));
        ws['!cols'] = [
            { wch: 18 },
            ...Array.from({ length: 5 }, () => ({ wch: 24 })),
            { wch: 14 },
        ];
        ws['!rows'] = [{ hpt: 22 }, ...Array.from({ length: shifts.length }, () => ({ hpt: 64 }))];
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    buildSheet(
        'רס\"ר',
        t('Rasar'),
        [
            { id: 'rasar_1', label: '08:30-11:30' },
            { id: 'rasar_2', label: '13:30-17:30' },
            { id: 'rasar_3', label: '19:30-20:30' },
        ],
        rasarAssignments,
        rasarOverrides
    );
    buildSheet(
        'ליווי 400',
        t('Contractor escort - 400'),
        [
            { id: 'escort400_1', label: '08:00-12:30' },
            { id: 'escort400_2', label: '12:30-17:00' },
        ],
        escort400Assignments,
        escort400Overrides
    );

    XLSX.writeFile(wb, `rasar_${base.format('YYYY-MM-DD')}.xlsx`);
};

export const exportToExcel = ({
    shifts,
    posts,
    people,
    assignments,
    esGroups,
    esAssignments,
    shiftOverrides,
    bwAssignments,
    start,
    end,
    t
}: ExportParams) => {
    const headers = [t('Day'), t('Shift'), ...posts.map(p => p.name), ...esGroups.map(g => g.name)];
    const bwDays = getBwDaysForRange(start, end, bwAssignments);
    const bwSlots = getBwSlotsForRange(start, end);

    const wb = XLSX.utils.book_new();
    const wsData: XLSX.CellObject[][] = [];

    const getRequiredCount = (postId: number, day: string, shiftLabel: string): number => {
        const override = shiftOverrides.find(o =>
            o.postId === postId && o.day === day && o.shiftLabel === shiftLabel
        );
        if (override) return override.requiredPerShift;
        const post = posts.find(p => p.id === postId);
        return post?.requiredPerShift || 1;
    };

    const getPeopleNames = (postId: number, shiftLabel: string, day: string): string => {
        const ids = getPersonIds(assignments, shiftLabel, day, postId);
        return people.filter(p => ids.includes(p.id)).map(p => p.name).join(", ");
    };
    
    // Header row
    const headerRow: XLSX.CellObject[] = headers.map((header, colIdx) => {
        let bgColor = '4472C4';
        if (colIdx >= 2 && colIdx < 2 + posts.length) {
            bgColor = '70AD47';
        } else if (colIdx >= 2 + posts.length) {
            bgColor = '5B9BD5';
        }
        
        return {
            v: header,
            t: 's',
            s: {
                font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 },
                fill: { fgColor: { rgb: bgColor } },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: {
                    top: { style: 'thin', color: { rgb: '000000' } },
                    bottom: { style: 'thin', color: { rgb: '000000' } },
                    left: { style: 'thin', color: { rgb: '000000' } },
                    right: { style: 'thin', color: { rgb: '000000' } }
                }
            }
        };
    });
    wsData.push(headerRow);
    
    // Data rows
    shifts.forEach((shift, rowIdx) => {
        const row: XLSX.CellObject[] = [];
        
        // Day column
        row.push({
            v: shift.day,
            t: 's',
            s: {
                font: { bold: true, sz: 11 },
                fill: { fgColor: { rgb: 'D9E2F3' } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: {
                    top: { style: 'thin', color: { rgb: '000000' } },
                    bottom: { style: 'thin', color: { rgb: '000000' } },
                    left: { style: 'thin', color: { rgb: '000000' } },
                    right: { style: 'thin', color: { rgb: '000000' } }
                }
            }
        });
        
        // Shift column
        row.push({
            v: shift.label,
            t: 's',
            s: {
                font: { bold: true, sz: 11 },
                fill: { fgColor: { rgb: 'D9E2F3' } },
                alignment: { horizontal: 'center', vertical: 'center' },
                border: {
                    top: { style: 'thin', color: { rgb: '000000' } },
                    bottom: { style: 'thin', color: { rgb: '000000' } },
                    left: { style: 'thin', color: { rgb: '000000' } },
                    right: { style: 'thin', color: { rgb: '000000' } }
                }
            }
        });
        
        // Post columns
        posts.forEach(post => {
            const names = getPeopleNames(post.id, shift.label, shift.day);
            const required = getRequiredCount(post.id, shift.day, shift.label);
            const assignedCount = getPersonIds(assignments, shift.label, shift.day, post.id).length;
            
            let bgColor = 'FFF2CC';
            if (required === 0) {
                bgColor = 'E0E0E0';
            } else if (assignedCount === 0) {
                bgColor = 'FFCCCC';
            } else if (assignedCount >= required) {
                bgColor = 'C6EFCE';
            }
            
            row.push({
                v: names || '-',
                t: 's',
                s: {
                    font: { sz: 10 },
                    fill: { fgColor: { rgb: bgColor } },
                    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                    border: {
                        top: { style: 'thin', color: { rgb: '000000' } },
                        bottom: { style: 'thin', color: { rgb: '000000' } },
                        left: { style: 'thin', color: { rgb: '000000' } },
                        right: { style: 'thin', color: { rgb: '000000' } }
                    }
                }
            });
        });
        
        // ES group columns
        esGroups.forEach(group => {
            const esAssignment = esAssignments.find(es => es.groupId === group.id);
            const names = rowIdx === 0 
                ? people.filter(p => esAssignment?.personIds.includes(p.id)).map(p => p.name).join("\n")
                : '';
            const assignedCount = esAssignment?.personIds.length || 0;
            const isFull = assignedCount >= group.totalPeople;
            
            let bgColor = 'DEEBF7';
            if (assignedCount === 0) {
                bgColor = 'FFCCCC';
            } else if (isFull) {
                bgColor = 'C6EFCE';
            }
            
            row.push({
                v: names,
                t: 's',
                s: {
                    font: { sz: 10 },
                    fill: { fgColor: { rgb: bgColor } },
                    alignment: { horizontal: 'center', vertical: 'top', wrapText: true },
                    border: {
                        top: { style: 'thin', color: { rgb: '000000' } },
                        bottom: { style: 'thin', color: { rgb: '000000' } },
                        left: { style: 'thin', color: { rgb: '000000' } },
                        right: { style: 'thin', color: { rgb: '000000' } }
                    }
                }
            });
        });
        
    wsData.push(row);
    });

    // Calculate total columns for shifts table
    const totalShiftCols = 2 + posts.length + esGroups.length;
    
    // BW section merges info (to be added to merges array later)
    const bwMerges: XLSX.Range[] = [];
    
    if (bwDays.length > 0) {
        wsData.push([]);
        wsData.push([{
            v: t('BW Assignments'),
            t: 's',
            s: { font: { bold: true, sz: 13 } }
        }]);

        // Calculate how many columns each BW day should span
        // First column is "Hours", remaining columns are split among bwDays
        const remainingCols = totalShiftCols - 1; // subtract 1 for Hours column
        const colsPerDay = Math.max(1, Math.floor(remainingCols / bwDays.length));
        
        // Build BW header row with merged cells for each day
        const bwHeaderRowIdx = wsData.length;
        const bwHeader: XLSX.CellObject[] = [
            {
                v: t('Hours'),
                t: 's' as any,
                s: {
                    font: { bold: true, color: { rgb: 'FFFFFF' } },
                    fill: { fgColor: { rgb: '5B9BD5' } },
                    alignment: { horizontal: 'center' },
                    border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                }
            }
        ];
        
        // Add cells for each day, with placeholder cells for merging
        bwDays.forEach((day, dayIdx) => {
            const startCol = 1 + dayIdx * colsPerDay;
            const endCol = startCol + colsPerDay - 1;
            
            // Add merge range for this day's header
            if (colsPerDay > 1) {
                bwMerges.push({
                    s: { r: bwHeaderRowIdx, c: startCol },
                    e: { r: bwHeaderRowIdx, c: endCol }
                });
            }
            
            // First cell has the day value
            bwHeader.push({
                v: day,
                t: 's' as any,
                s: {
                    font: { bold: true, color: { rgb: 'FFFFFF' } },
                    fill: { fgColor: { rgb: '5B9BD5' } },
                    alignment: { horizontal: 'center' },
                    border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                }
            });
            
            // Add empty cells for the rest of the merge
            for (let i = 1; i < colsPerDay; i++) {
                bwHeader.push({
                    v: '',
                    t: 's' as any,
                    s: {
                        fill: { fgColor: { rgb: '5B9BD5' } },
                        border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                    }
                });
            }
        });
        wsData.push(bwHeader);

        bwSlots.forEach((slot, slotIdx) => {
            const dataRowIdx = wsData.length;
            const row: XLSX.CellObject[] = [{
                v: slot.label,
                t: 's' as any,
                s: {
                    font: { bold: true },
                    fill: { fgColor: { rgb: 'D9E2F3' } },
                    alignment: { horizontal: 'center' },
                    border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                }
            }];

            bwDays.forEach((day, dayIdx) => {
                const assignedNames = bwAssignments
                    .filter(a => a.day === day && a.slotId === slot.id)
                    .map(a => people.find(p => p.id === a.personId)?.name || a.personId)
                    .join(", ");
                const count = bwAssignments.filter(a => a.day === day && a.slotId === slot.id).length;
                let bgColor = 'FFF2CC';
                if (count === 0) bgColor = 'FFCCCC';
                else if (count >= BW_REQUIRED_PER_SLOT) bgColor = 'C6EFCE';

                const startCol = 1 + dayIdx * colsPerDay;
                const endCol = startCol + colsPerDay - 1;
                
                // Add merge range for this day's data cell
                if (colsPerDay > 1) {
                    bwMerges.push({
                        s: { r: dataRowIdx, c: startCol },
                        e: { r: dataRowIdx, c: endCol }
                    });
                }

                row.push({
                    v: assignedNames || '-',
                    t: 's' as any,
                    s: {
                        font: { sz: 10 },
                        fill: { fgColor: { rgb: bgColor } },
                        alignment: { horizontal: 'center', vertical: 'top', wrapText: true },
                        border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                    }
                });
                
                // Add empty cells for the rest of the merge
                for (let i = 1; i < colsPerDay; i++) {
                    row.push({
                        v: '',
                        t: 's' as any,
                        s: {
                            fill: { fgColor: { rgb: bgColor } },
                            border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } }
                        }
                    });
                }
            });

            wsData.push(row);
        });
    }
    
    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData.map(row => row.map(cell => cell.v)));
    
    // Apply styles
    wsData.forEach((row, rowIdx) => {
        row.forEach((cell, colIdx) => {
            const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
            if (ws[cellRef]) {
                ws[cellRef].s = cell.s;
            }
        });
    });
    
    // Column widths
    const baseCols: XLSX.ColInfo[] = [
        { wch: 12 },
        { wch: 14 },
        ...posts.map(() => ({ wch: 18 })),
        ...esGroups.map(() => ({ wch: 20 })),
    ];
    const neededCols = Math.max(baseCols.length, 1 + bwDays.length);
    while (baseCols.length < neededCols) {
        baseCols.push({ wch: 18 });
    }
    ws['!cols'] = baseCols;
    
    // Row heights
    const totalShiftRows = shifts.length;
    const hasBW = bwDays.length > 0;
    ws['!rows'] = wsData.map((_, rowIdx) => {
        if (rowIdx === 0) return { hpt: 30 }; // main header
        if (rowIdx >= 1 && rowIdx <= totalShiftRows) return { hpt: 25 }; // shift rows

        if (!hasBW) return {}; // default height

        const bwBlankRowIdx = totalShiftRows + 1;
        const bwTitleRowIdx = totalShiftRows + 2;
        const bwHeaderRowIdx = totalShiftRows + 3;

        if (rowIdx === bwBlankRowIdx) return { hpt: 6 };
        if (rowIdx === bwTitleRowIdx) return { hpt: 20 };
        if (rowIdx === bwHeaderRowIdx) return { hpt: 24 };

        // BW data rows – make them taller to show many names
        if (rowIdx > bwHeaderRowIdx) return { hpt: 55 };

        return {};
    });
    
    // Merge ES group cells
    const merges: XLSX.Range[] = [];
    esGroups.forEach((_, esIdx) => {
        const colIdx = 2 + posts.length + esIdx;
        if (shifts.length > 1) {
            merges.push({
                s: { r: 1, c: colIdx },
                e: { r: shifts.length, c: colIdx }
            });
        }
    });
    // Add BW merges
    merges.push(...bwMerges);
    ws['!merges'] = merges;
    
    XLSX.utils.book_append_sheet(wb, ws, t('Schedule'));
    XLSX.writeFile(wb, `schedule_${start.slice(0, 10)}_to_${end.slice(0, 10)}.xlsx`);

    // ---- Per-person summary workbook ----
    const esMemberSet = new Set<number>();
    esAssignments.forEach(es => es.personIds.forEach(pid => esMemberSet.add(pid)));

    const startDt = dayjs(start);
    const endDt = dayjs(end);
    const inRangeShift = (assignment: Assignment) => {
        const window = getShiftTimeWindow(assignment.shiftLabel);
        if (!window) return false;
        const shiftStart = dayjs(`${assignment.day}T00:00`).add(window.start, 'minute');
        let shiftEnd = dayjs(`${assignment.day}T00:00`).add(window.end, 'minute');
        if (window.end <= window.start) {
            shiftEnd = shiftEnd.add(1, 'day');
        }
        return shiftStart.isBefore(endDt) && shiftEnd.isAfter(startDt);
    };
    const inRangeBw = (b: BWAssignment) => {
        const slot = BW_SLOT_DEFINITIONS.find(s => s.id === b.slotId);
        if (!slot) return false;
        const bwStart = dayjs(`${b.day}T00:00`).add(slot.startHour, 'hour').add(slot.startMinute, 'minute');
        let bwEnd = dayjs(`${b.day}T00:00`).add(slot.endHour, 'hour').add(slot.endMinute, 'minute');
        if (!bwEnd.isAfter(bwStart)) {
            bwEnd = bwEnd.add(1, 'day');
        }
        return bwStart.isBefore(endDt) && bwEnd.isAfter(startDt);
    };

    const perPerson = people.map(p => {
        // Count unique shifts (day + shiftLabel) within range to avoid double-counting multiple posts in same shift
        const shiftKeys = new Set(
            assignments
                .filter(a => a.personId === p.id && inRangeShift(a))
                .map(a => `${a.day}|${a.shiftLabel}`)
        );
        const shiftsCount = shiftKeys.size;
        const bwCount = bwAssignments.filter(b => b.personId === p.id && inRangeBw(b)).length;
        const nameWithEs = esMemberSet.has(p.id) ? `${p.name} (כ"כ)` : p.name;
        return { name: nameWithEs, shiftsCount, bwCount };
    }).sort((a, b) => {
        if (b.shiftsCount !== a.shiftsCount) return b.shiftsCount - a.shiftsCount;
        if (b.bwCount !== a.bwCount) return b.bwCount - a.bwCount;
        return a.name.localeCompare(b.name);
    });

    const wb2 = XLSX.utils.book_new();
    const wsSummaryData: XLSX.CellObject[][] = [];

    wsSummaryData.push([
        { v: t('Name'), t: 's', s: { font: { bold: true }, alignment: { horizontal: 'center' }, border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } } } },
        { v: t('Shifts'), t: 's', s: { font: { bold: true }, alignment: { horizontal: 'center' }, border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } } } },
        { v: t('BW Assignments'), t: 's', s: { font: { bold: true }, alignment: { horizontal: 'center' }, border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } } } },
    ]);

    perPerson.forEach((p, idx) => {
        wsSummaryData.push([
            { v: p.name, t: 's', s: { alignment: { horizontal: 'left' }, border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } } } },
            { v: p.shiftsCount, t: 'n', s: { alignment: { horizontal: 'center' }, border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } } } },
            { v: p.bwCount, t: 'n', s: { alignment: { horizontal: 'center' }, border: { top: { style: 'thin', color: { rgb: '000000' } }, bottom: { style: 'thin', color: { rgb: '000000' } }, left: { style: 'thin', color: { rgb: '000000' } }, right: { style: 'thin', color: { rgb: '000000' } } } } },
        ]);
    });

    const wsSummary = XLSX.utils.aoa_to_sheet(wsSummaryData.map(row => row.map(cell => cell.v)));
    wsSummaryData.forEach((row, r) => {
        row.forEach((cell, c) => {
            const ref = XLSX.utils.encode_cell({ r, c });
            if (wsSummary[ref]) wsSummary[ref].s = cell.s;
        });
    });

    wsSummary['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 12 }];

    XLSX.utils.book_append_sheet(wb2, wsSummary, 'Shifts per person');
    XLSX.writeFile(wb2, `shifts_per_person_${start.slice(0, 10)}_to_${end.slice(0, 10)}.xlsx`);
};

