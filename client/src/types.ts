export type Gender = 'M' | 'F' | 'X';
export type ESGroupId = 'es1' | 'es2';

export interface Person {
  id: number;
  name: string;
  gender: Gender;
  sameGenderPreference: boolean;
  exemptions: string[];
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
