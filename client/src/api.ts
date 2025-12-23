import type {
  Assignment,
  BWAssignment,
  ESGroupAssignment,
  Person,
  Post,
  Constraint,
  KitchenAssignment,
  EscortAssignment,
  KitchenSettings,
  EscortSettings,
} from './types';

const BASE = '/api';

const request = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      try {
        message = await response.text();
      } catch {
        // ignore
      }
    }
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

type AddPersonPayload = {
  name: string;
  gender: Person['gender'];
  sameGenderPref: boolean;
  limitedAbility: boolean;
  standingExemption: boolean;
  duelGuard: boolean;
};

type AddPostPayload = {
  name: string;
  requiredPerShift: number;
};

type ExistingAssignment = Pick<Assignment, 'postId' | 'personId' | 'day' | 'shiftLabel'>;

type ScheduleResponse = {
  assignments?: Assignment[];
  bwAssignments?: BWAssignment[];
  esAssignments?: ESGroupAssignment[];
  kitchenAssignments?: KitchenAssignment[];
  escortAssignments?: EscortAssignment[];
  kitchenSettings?: KitchenSettings;
  escortSettings?: EscortSettings;
  error?: string;
};

type ScheduleSnapshot = {
  assignments: Assignment[];
  bwAssignments: BWAssignment[];
  esAssignments: ESGroupAssignment[];
  kitchenAssignments?: KitchenAssignment[];
  escortAssignments?: EscortAssignment[];
  kitchenSettings?: KitchenSettings;
  escortSettings?: EscortSettings;
};

export const register = (email: string, password: string) =>
  request<{ id: number; email: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const login = (email: string, password: string) =>
  request<{ id: number; email: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const logout = () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' });
export const fetchMe = () => request<{ id: number; email: string }>('/auth/me');

export const fetchConstraints = () => request<Constraint[]>('/constraints');

export const addConstraint = (body: Omit<Constraint, 'id'>) =>
  request<Constraint>('/constraints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const deleteConstraint = (id: number) =>
  request<{ ok: boolean }>(`/constraints/${id}`, { method: 'DELETE' });

export const fetchPeople = () => request<Person[]>('/people');

export const addPerson = (body: AddPersonPayload) =>
  request<Person>('/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const deletePerson = (id: number) => request<{ ok: boolean }>(`/people/${id}`, { method: 'DELETE' });

export const fetchPosts = () => request<Post[]>('/posts');

export const addPost = (body: AddPostPayload) =>
  request<Post>('/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const deletePost = (id: number) => request<{ ok: boolean }>(`/posts/${id}`, { method: 'DELETE' });

export const generateSchedule = (
  startISO: string,
  endISO: string,
  shiftOverrides: { postId: number; day: string; shiftLabel: string; requiredPerShift: number }[] = [],
  esAssignments: ESGroupAssignment[] = [],
  existingAssignments: ExistingAssignment[] = [],
  existingBwAssignments: BWAssignment[] = [],
  existingKitchenAssignments: KitchenAssignment[] = [],
  existingEscortAssignments: EscortAssignment[] = [],
  kitchenSettings: KitchenSettings = { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' },
  escortSettings: EscortSettings = { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 },
  constraints: Constraint[] = []
) =>
  request<ScheduleResponse>('/schedule/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startISO,
      endISO,
      shiftOverrides,
      esAssignments,
      existingAssignments,
      existingBwAssignments,
      existingKitchenAssignments,
      existingEscortAssignments,
      kitchenSettings,
      escortSettings,
      constraints,
    }),
  });

export const generateGuardsSchedule = (
  startISO: string,
  endISO: string,
  shiftOverrides: { postId: number; day: string; shiftLabel: string; requiredPerShift: number }[] = [],
  esAssignments: ESGroupAssignment[] = [],
  existingAssignments: ExistingAssignment[] = [],
  existingBwAssignments: BWAssignment[] = [],
  existingKitchenAssignments: KitchenAssignment[] = [],
  existingEscortAssignments: EscortAssignment[] = [],
  kitchenSettings: KitchenSettings = { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' },
  escortSettings: EscortSettings = { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 },
  constraints: Constraint[] = []
) =>
  request<ScheduleResponse>('/schedule/generate-guards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startISO,
      endISO,
      shiftOverrides,
      esAssignments,
      existingAssignments,
      existingBwAssignments,
      existingKitchenAssignments,
      existingEscortAssignments,
      kitchenSettings,
      escortSettings,
      constraints,
    }),
  });

export const generateKitchenSchedule = (
  guardsStartISO: string,
  guardsEndISO: string,
  kitchenStartISO: string,
  kitchenEndISO: string,
  esAssignments: ESGroupAssignment[] = [],
  existingAssignments: ExistingAssignment[] = [],
  existingBwAssignments: BWAssignment[] = [],
  existingKitchenAssignments: KitchenAssignment[] = [],
  existingEscortAssignments: EscortAssignment[] = [],
  kitchenSettings: KitchenSettings = { requiredShift1: 36, requiredShift2: 36, shift2Start: '13:00' },
  escortSettings: EscortSettings = { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 },
  constraints: Constraint[] = []
) =>
  request<ScheduleResponse>('/schedule/generate-kitchen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startISO: guardsStartISO,
      endISO: guardsEndISO,
      kitchenStartISO,
      kitchenEndISO,
      esAssignments,
      existingAssignments,
      existingBwAssignments,
      existingKitchenAssignments,
      existingEscortAssignments,
      kitchenSettings,
      escortSettings,
      constraints,
    }),
  });

export const clearSchedule = (mode: 'all' | 'guards' | 'kitchen' = 'all') =>
  request<{ ok: boolean }>(`/schedule/clear?mode=${encodeURIComponent(mode)}`, { method: 'DELETE' });

export const fetchLastSchedule = () => request<ScheduleSnapshot>('/schedule/last');

export const fetchScheduleByDate = (date: string) =>
  request<ScheduleSnapshot>(`/schedule/history?date=${encodeURIComponent(date)}`);

export const fetchHistoryPeriods = () =>
  request<{ periods: { start: string; end: string }[] }>('/schedule/history-periods');

export const fetchScheduleByPeriod = (start: string, end: string) =>
  request<ScheduleSnapshot>(`/schedule/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);

export const saveAllSchedules = (
  assignments: Assignment[],
  bwAssignments: BWAssignment[],
  esAssignments: ESGroupAssignment[],
  kitchenAssignments: KitchenAssignment[],
  escortAssignments: EscortAssignment[],
  kitchenSettings: KitchenSettings,
  escortSettings: EscortSettings,
  start: string,
  end: string
) =>
  request<{ ok: boolean; error?: string }>('/schedule/save-all', {
    method: 'POST',
    body: JSON.stringify({
      assignments,
      bwAssignments,
      esAssignments,
      kitchenAssignments,
      escortAssignments,
      kitchenSettings,
      escortSettings,
      start,
      end,
    }),
  });
