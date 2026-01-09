import dayjs from "dayjs";
import { Assignment, BWAssignment } from "../../types";

export interface ShiftSlot {
    day: string;
    displayDay: string;
    label: string;
}

export const getShiftsForPeriod = (start: string, end: string): ShiftSlot[] => {
    const result: ShiftSlot[] = [];
    const startDt = dayjs(start).second(0).millisecond(0);
    const endDt = dayjs(end).second(0).millisecond(0);

    const formatLabel = (s: dayjs.Dayjs, e: dayjs.Dayjs) =>
        `${s.format('HH:mm')}-${e.format('HH:mm')}`;

    const addShift = (s: dayjs.Dayjs, e: dayjs.Dayjs) => {
        result.push({
            day: s.format('YYYY-MM-DD'),
            displayDay: s.format('DD/MM/YY'),
            label: formatLabel(s, e),
        });
    };

    // First partial if not aligned
    const startMinutes = startDt.hour() * 60 + startDt.minute();
    const nextBoundaryMinutes = Math.ceil(startMinutes / 240) * 240;
    const minutesToAdd = nextBoundaryMinutes - startMinutes;
    const firstEnd = startDt.add(minutesToAdd || 240, 'minute');
    addShift(startDt, firstEnd.isAfter(endDt) ? endDt : firstEnd);

    // Standard 4h blocks
    let cursor = firstEnd;
    while (cursor.add(4, 'hour').isBefore(endDt) || cursor.add(4, 'hour').isSame(endDt)) {
        const shiftEnd = cursor.add(4, 'hour');
        addShift(cursor, shiftEnd);
        cursor = shiftEnd;
    }

    // Last partial
    if (cursor.isBefore(endDt)) {
        addShift(cursor, endDt);
    }

    return result;
};

export const getShiftIndex = (day: string, shiftLabel: string, allShifts: ShiftSlot[]): number =>
    allShifts.findIndex(s => s.day === day && s.label === shiftLabel);

// NOTE: backend/DB may return numeric IDs as strings; normalize to numbers here so
// lookups like `people.find(p => ids.includes(p.id))` work reliably.
const uniquePersonIds = (assignments: Assignment[], predicate: (assignment: Assignment) => boolean) =>
    [...new Set(assignments.filter(predicate).map(a => Number((a as any).personId)))];

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

export const isNightShift = (label: string) => {
    // Check exact matches first
    if (NIGHT_SHIFT_LABELS.has(label)) return true;

    // Parse shift label to check if it overlaps with night hours (20:00-08:00)
    const match = label.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
    if (!match) return false;

    const startHour = parseInt(match[1]);
    const startMinute = parseInt(match[2]);
    const endHour = parseInt(match[3]);
    const endMinute = parseInt(match[4]);

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    // Night period: 20:00 to 08:00 (wraps around midnight)
    // A shift is a night shift if it starts OR ends in the night period
    // Night period: 20:00-23:59 (same day) OR 00:00-07:59 (next day)

    // Check if shift starts in night period
    const startsInNight = (startMinutes >= 20 * 60) || (startMinutes < 8 * 60);

    // Check if shift ends in night period
    const endsInNight = (endMinutes > 20 * 60) || (endMinutes <= 8 * 60);

    // Also check if shift crosses midnight and overlaps with night
    const crossesMidnight = endMinutes <= startMinutes;
    if (crossesMidnight) {
        // Shift crosses midnight, so it definitely overlaps with night period
        return true;
    }

    return startsInNight || endsInNight;
};
export const STANDING_EXEMPT_POST_NAMES: string[] = (() => {
    const defaultNames = ["שג רגלי", "ימח", "שג רכוב אחורי", "שג רכוב קדמי", "עתודה"];

    try {
        const envValue = import.meta.env?.VITE_STANDING_EXEMPT_POST_NAMES;

        return envValue ? JSON.parse(envValue) : defaultNames;
    } catch {
        return defaultNames;
    }
})();
export const isStandingExemptPost = (postName?: string) =>
    !!postName && STANDING_EXEMPT_POST_NAMES.includes(postName);

// Asthma exemption: person can ONLY work this specific post
export const ASTHMA_ALLOWED_POST_NAME = 'תצפיתן';
export const isAsthmaAllowedPost = (postName?: string) =>
    postName === ASTHMA_ALLOWED_POST_NAME;

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

export const BW_REQUIRED_PER_SLOT = (() => {
    const envValue = import.meta.env?.VITE_BW_REQUIRED;
    return envValue ? parseInt(envValue) : 20;
})();

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
    const daysSet = new Set<string>();

    const addDayIfApplicable = (day: dayjs.Dayjs | string) => {
        const normalized = dayjs(day).startOf('day');
        // Check if any BW slot on this day overlaps with the actual time range
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

    // Iterate through days from start to end
    let cursor = startDt.startOf('day');
    const lastDay = endDt.startOf('day');
    while (cursor.isBefore(lastDay) || cursor.isSame(lastDay, 'day')) {
        addDayIfApplicable(cursor);
        cursor = cursor.add(1, 'day');
    }

    return Array.from(daysSet).sort();
};

export const getBwSlotsForRange = (start: string, end: string): BwSlotDefinition[] => {
    const startDt = dayjs(start);
    const endDt = dayjs(end);

    return BW_SLOT_DEFINITIONS.filter(slot => {
        // Check if this slot overlaps with the actual time range (not full days)
        // Iterate through each day in the range
        let cursor = startDt.startOf('day');
        const lastDay = endDt.startOf('day');

        while (cursor.isBefore(lastDay) || cursor.isSame(lastDay, 'day')) {
            const slotStart = cursor.add(slot.startHour, 'hour').add(slot.startMinute, 'minute');
            let slotEnd = cursor.add(slot.endHour, 'hour').add(slot.endMinute, 'minute');
            if (!slotEnd.isAfter(slotStart)) {
                slotEnd = slotEnd.add(1, 'day');
            }

            // Check if this slot instance overlaps with the actual range (not full day)
            if (slotEnd.isAfter(startDt) && slotStart.isBefore(endDt)) {
                return true;
            }

            cursor = cursor.add(1, 'day');
        }

        return false;
    });
};


