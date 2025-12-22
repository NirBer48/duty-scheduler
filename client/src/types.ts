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

export interface KitchenSettings {
  requiredPerShift: number; // default 36
  shift2Start: string; // "HH:mm" start time of the 2nd shift (also end of 1st)
}

export interface KitchenAssignment {
  day: string; // YYYY-MM-DD
  shiftId: string; // kitchen_1 | kitchen_2
  personId: number;
  start?: string;
  end?: string;
}

export interface EscortSettings {
  requiredPerShift: number; // default 4
}

export interface EscortAssignment {
  day: string; // YYYY-MM-DD
  shiftId: string; // escort_1..escort_4
  personId: number;
  start?: string;
  end?: string;
}