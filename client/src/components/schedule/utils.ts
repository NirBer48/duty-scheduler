import { Assignment } from "../../types";

export interface ShiftSlot {
    day: string;
    label: string;
}

export function getShiftsForPeriod(start: string, end: string): ShiftSlot[] {
    const result: ShiftSlot[] = [];
    const shifts = [
        { label: "00:00-04:00", startH: 0 },
        { label: "04:00-08:00", startH: 4 },
        { label: "08:00-12:00", startH: 8 },
        { label: "12:00-16:00", startH: 12 },
        { label: "16:00-20:00", startH: 16 },
        { label: "20:00-00:00", startH: 20 },
    ];
    const startDate = new Date(start);
    const endDate = new Date(end);
    startDate.setMinutes(0, 0, 0);
    startDate.setHours(Math.floor(startDate.getHours() / 4) * 4);

    const curr = new Date(startDate);
    while (curr < endDate) {
        const h = curr.getHours();
        const shift = shifts.find(s => s.startH === h);
        if (shift) {
            const year = curr.getFullYear();
            const month = String(curr.getMonth() + 1).padStart(2, '0');
            const date = String(curr.getDate()).padStart(2, '0');
            const dayStr = `${year}-${month}-${date}`;
            result.push({
                day: dayStr,
                label: shift.label,
            });
        }
        curr.setHours(curr.getHours() + 4);
    }
    return result;
}

export function getShiftIndex(day: string, shiftLabel: string, allShifts: ShiftSlot[]): number {
    return allShifts.findIndex(s => s.day === day && s.label === shiftLabel);
}

export function getAssignedPersonIds(
    assignments: Assignment[], 
    postId: number, 
    shiftLabel: string, 
    day: string
): number[] {
    const matched = assignments.filter(a => 
        a.postId === postId && a.shiftLabel === shiftLabel && a.day === day
    );
    return [...new Set(matched.map(a => a.personId))];
}

export function getPeopleAtShift(
    assignments: Assignment[], 
    shiftLabel: string, 
    day: string
): number[] {
    const matched = assignments.filter(a => a.shiftLabel === shiftLabel && a.day === day);
    return [...new Set(matched.map(a => a.personId))];
}

export function getCellKey(postId: number, day: string, shiftLabel: string): string {
    return `${postId}-${day}-${shiftLabel}`;
}

