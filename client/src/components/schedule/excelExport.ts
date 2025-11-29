import XLSX from 'xlsx-js-style';
import { Person, Post, Assignment, ESGroup, ESGroupAssignment, ShiftOverride } from "../../types";
import { ShiftSlot, getPersonIds } from "./utils";

interface ExportParams {
    shifts: ShiftSlot[];
    posts: Post[];
    people: Person[];
    assignments: Assignment[];
    esGroups: ESGroup[];
    esAssignments: ESGroupAssignment[];
    shiftOverrides: ShiftOverride[];
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
    start,
    end,
    t
}: ExportParams) => {
    const headers = [t('Day'), t('Shift'), ...posts.map(p => p.name), ...esGroups.map(g => g.name)];

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
    ws['!cols'] = [
        { wch: 12 },
        { wch: 14 },
        ...posts.map(() => ({ wch: 18 })),
        ...esGroups.map(() => ({ wch: 20 })),
    ];
    
    // Row heights
    ws['!rows'] = [
        { hpt: 30 },
        ...shifts.map(() => ({ hpt: 25 }))
    ];
    
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
    ws['!merges'] = merges;
    
    XLSX.utils.book_append_sheet(wb, ws, t('Schedule'));
    XLSX.writeFile(wb, `schedule_${start.slice(0, 10)}_to_${end.slice(0, 10)}.xlsx`);
};

