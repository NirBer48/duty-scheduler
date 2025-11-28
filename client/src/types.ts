export interface Person {
  id: number;
  name: string;
  gender: 'M' | 'F' | 'X';
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
  groupId: 'es1' | 'es2';
  personIds: number[];
}

export interface ESGroup {
  id: 'es1' | 'es2';
  name: string;
  totalPeople: number;
  activePerShift: number;
}
