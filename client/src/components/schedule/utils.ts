import dayjs from "dayjs";
import { Assignment, BWAssignment } from "../../types";

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

export const SHIFT_TIME_RANGES: Record<string, { start: number; end: number }> = {
    "00:00-04:00": { start: 0, end: 240 },
    "04:00-08:00": { start: 240, end: 480 },
    "08:00-12:00": { start: 480, end: 720 },
    "12:00-16:00": { start: 720, end: 960 },
    "16:00-20:00": { start: 960, end: 1200 },
    "20:00-00:00": { start: 1200, end: 1440 },
};

export const getShiftTimeWindow = (label: string) => SHIFT_TIME_RANGES[label];
export const NIGHT_SHIFT_LABELS = new Set(["20:00-00:00", "00:00-04:00", "04:00-08:00"]);
export const isNightShift = (label: string) => NIGHT_SHIFT_LABELS.has(label);
export const STANDING_EXEMPT_POST_NAMES: string[] = ["ימח","שג רכוב אחורי","שג רכוב קדמי","עתודה"];
export const isStandingExemptPost = (postName?: string) =>
    !!postName && STANDING_EXEMPT_POST_NAMES.includes(postName);

const minutesFromMidnight = (hour: number, minute: number) => hour * 60 + minute;

export interface BwSlotDefinition {
    id: string;
    label: string;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
}

export const BW_SLOT_DEFINITIONS: BwSlotDefinition[] = [
    { id: 'bw_morning', label: '08:30-11:30', startHour: 8, startMinute: 30, endHour: 11, endMinute: 30 },
    { id: 'bw_afternoon', label: '13:30-17:30', startHour: 13, startMinute: 30, endHour: 17, endMinute: 30 },
    { id: 'bw_evening', label: '18:30-20:00', startHour: 18, startMinute: 30, endHour: 20, endMinute: 0 },
];

export const BW_REQUIRED_PER_SLOT = 20;

export const getBwSlotKey = (day: string, slotId: string) => `${day}|${slotId}`;

export const getBwSlotRangeMinutes = (slot: BwSlotDefinition) => ({
    start: minutesFromMidnight(slot.startHour, slot.startMinute),
    end: minutesFromMidnight(slot.endHour, slot.endMinute),
});

export const hasTimeOverlap = (startA: number, endA: number, startB: number, endB: number) =>
    startA < endB && startB < endA;

export const getBwDaysForRange = (start: string, end: string, existing: BWAssignment[] = []): string[] => {
    const startDt = dayjs(start);
    const endDt = dayjs(end);
    const rangeStart = startDt.startOf('day');
    const rangeEnd = endDt.endOf('day');
    const daysSet = new Set<string>();

    const addDayIfApplicable = (day: dayjs.Dayjs | string) => {
        const normalized = dayjs(day).startOf('day');
        if (normalized.isBefore(rangeStart) || normalized.isAfter(rangeEnd)) {
            return;
        }
        const hasSlotWithinRange = BW_SLOT_DEFINITIONS.some(slot => {
            const slotStart = normalized.add(slot.startHour, 'hour').add(slot.startMinute, 'minute');
            let slotEnd = normalized.add(slot.endHour, 'hour').add(slot.endMinute, 'minute');
            if (!slotEnd.isAfter(slotStart)) {
                slotEnd = slotEnd.add(1, 'day');
            }
            return slotEnd.isAfter(startDt) && slotStart.isBefore(endDt);
        });
        if (hasSlotWithinRange) {
            daysSet.add(normalized.format('YYYY-MM-DD'));
        }
    };

    existing.forEach(bw => addDayIfApplicable(bw.day));

    let cursor = rangeStart.clone();
    while (cursor.isBefore(rangeEnd) || cursor.isSame(rangeEnd, 'day')) {
        addDayIfApplicable(cursor);
        cursor = cursor.add(1, 'day');
    }

    return Array.from(daysSet).sort();
};


