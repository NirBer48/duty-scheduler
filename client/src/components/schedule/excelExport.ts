import XLSX from 'xlsx-js-style';
import { Person, Post, Assignment, ESGroup, ESGroupAssignment, ShiftOverride, BWAssignment } from "../../types";
import { ShiftSlot, getPersonIds, BW_SLOT_DEFINITIONS, BW_REQUIRED_PER_SLOT, getBwDaysForRange } from "./utils";

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

        BW_SLOT_DEFINITIONS.forEach((slot, slotIdx) => {
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
};

