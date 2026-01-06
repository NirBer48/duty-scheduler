export type Gender = 'M' | 'F' | 'X';
export type ESGroupId = 'es1' | 'es2';

export interface Person {
  id: number;
  name: string;
  gender: Gender;
  sameGenderPreference: boolean;
  limitedAbility: boolean;
  standingExemption: boolean;
  duelGuard: boolean;
  nightGuardExemption: boolean;
}

export interface Post {
  id: number;
  name: string;
  requiredPerShift: number;
  optional?: boolean;
}

export interface Assignment {
  postId: number;
  personId: number;
  shiftLabel: string;
  start: string;
  end: string;
  day: string;
}

export interface BWAssignment {
  day: string;
  slotId: string;
  personId: number;
  start?: string;
  end?: string;
}

export interface Constraint {
  id: number;
  personId: number;
  title: string;
  startISO: string;
  endISO: string;
}

export interface ShiftOverride {
  postId: number;
  day: string;
  shiftLabel: string;
  requiredPerShift: number;
}

export interface ESGroupAssignment {
  groupId: ESGroupId;
  personIds: number[];
}

export interface ESGroup {
  id: ESGroupId;
  name: string;
  totalPeople: number;
  activePerShift: number;
}

export interface KitchenShift {
  id: string; // stable opaque id (UUID string recommended)
  start: string; // "HH:mm" (must partition 06:00..21:00 contiguously)
  end: string; // "HH:mm"
  required: number; // people required in this shift (default 36)
}

export interface KitchenSettings {
  shifts: KitchenShift[];
}

export interface KitchenAssignment {
  day: string; // YYYY-MM-DD
  shiftId: string; // KitchenShift.id
  personId: number;
  start?: string;
  end?: string;
}

export interface EscortSettings {
  requiredShift1: number; // 07:00-10:30 (default 4)
  requiredShift2: number; // 10:30-14:00 (default 4)
  requiredShift3: number; // 14:00-17:00 (default 4)
  requiredShift4: number; // 17:00-19:00 (default 4)
}

export interface EscortAssignment {
  day: string; // YYYY-MM-DD
  shiftId: string; // escort_1..escort_4
  personId: number;
  start?: string;
  end?: string;
}

export interface RasarAssignment {
  day: string; // YYYY-MM-DD
  shiftId: string; // rasar_1 | rasar_2 | rasar_3
  personId: number;
  start?: string;
  end?: string;
}

export interface RasarOverride {
  day: string; // YYYY-MM-DD
  shiftId: string; // rasar_1 | rasar_2 | rasar_3
  required: number;
}

export interface Escort400Assignment {
  day: string; // YYYY-MM-DD
  shiftId: string; // escort400_1 | escort400_2
  personId: number;
  start?: string;
  end?: string;
}

export interface Escort400Override {
  day: string; // YYYY-MM-DD
  shiftId: string; // escort400_1 | escort400_2
  required: number;
}