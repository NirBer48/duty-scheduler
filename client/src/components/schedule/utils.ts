import { Assignment } from "../../types";

export interface ShiftSlot {
    day: string;
    label: string;
}

export const getShiftsForPeriod = (start: string, end: string): ShiftSlot[] => {
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
            result.push({
                day: `${year}-${month}-${date}`,
                label: shift.label,
            });
        }
        curr.setHours(curr.getHours() + 4);
    }
    return result;
};

export const getShiftIndex = (day: string, shiftLabel: string, allShifts: ShiftSlot[]): number =>
    allShifts.findIndex(s => s.day === day && s.label === shiftLabel);

const uniquePersonIds = (assignments: Assignment[], predicate: (assignment: Assignment) => boolean) =>
    [...new Set(assignments.filter(predicate).map(a => a.personId))];

export const getPersonIds = (
    assignments: Assignment[],
    shiftLabel: string,
    day: string,
    postId?: number
): number[] =>
    uniquePersonIds(
        assignments,
        a =>
            a.shiftLabel === shiftLabel &&
            a.day === day &&
            (postId === undefined || a.postId === postId)
    );

export const getCellKey = (postId: number, day: string, shiftLabel: string): string =>
    `${postId}-${day}-${shiftLabel}`;


