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
  RasarAssignment,
  RasarOverride,
  Escort400Assignment,
  Escort400Override,
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

// ---- Small, centralized normalization helpers ----
// We avoid changing server "model building", but Postgres can return numeric IDs as strings.
// Normalize here at the API boundary so the rest of the app can keep using number IDs.
const toNumber = (v: any): number => (typeof v === 'number' ? v : Number(v));

const normalizePerson = (p: any): Person => ({
  ...p,
  id: toNumber(p.id),
});

const normalizePost = (p: any): Post => ({
  ...p,
  id: toNumber(p.id),
  requiredPerShift: toNumber(p.requiredPerShift ?? p.requiredpershift ?? 1),
});

const normalizeScheduleResponse = (res: any): ScheduleResponse => ({
  ...res,
  assignments: (res?.assignments || []).map((a: any) => ({
    ...a,
    personId: toNumber(a.personId),
    postId: toNumber(a.postId),
  })),
  bwAssignments: (res?.bwAssignments || []).map((a: any) => ({
    ...a,
    personId: toNumber(a.personId),
  })),
  kitchenAssignments: (res?.kitchenAssignments || []).map((a: any) => ({
    ...a,
    personId: toNumber(a.personId),
  })),
  escortAssignments: (res?.escortAssignments || []).map((a: any) => ({
    ...a,
    personId: toNumber(a.personId),
  })),
  esAssignments: (res?.esAssignments || []).map((es: any) => ({
    ...es,
    personIds: (es?.personIds || []).map((pid: any) => toNumber(pid)),
  })),
});

type AddPersonPayload = {
  name: string;
  gender: Person['gender'];
  sameGenderPref: boolean;
  limitedAbility: boolean;
  standingExemption: boolean;
  duelGuard: boolean;
  nightGuardExemption: boolean;
  asthmaExemption: boolean;
  kitchenExemption: boolean;
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
  rasarAssignments?: RasarAssignment[];
  escort400Assignments?: Escort400Assignment[];
  kitchenSettings?: KitchenSettings;
  escortSettings?: EscortSettings;
  error?: string;
  missingCount?: number;
  violations?: Array<{ personId: number; message: string }>;
};

type ScheduleSnapshot = {
  assignments: Assignment[];
  bwAssignments: BWAssignment[];
  esAssignments: ESGroupAssignment[];
  kitchenAssignments?: KitchenAssignment[];
  escortAssignments?: EscortAssignment[];
  rasarAssignments?: RasarAssignment[];
  escort400Assignments?: Escort400Assignment[];
  kitchenSettings?: KitchenSettings;
  escortSettings?: EscortSettings;
};

export type JusticeRow = {
  personId: number;
  name: string;
  guardsHours: number;
  bwHours: number;
  kitchenHours: number;
  escortHours: number;
  rasarHours: number;
  escort400Hours: number;
  totalHours: number;
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

export const fetchPeople = async () => (await request<Person[]>('/people')).map(normalizePerson);

export const addPerson = (body: AddPersonPayload) =>
  request<Person>('/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(normalizePerson);

export const deletePerson = (id: number) => request<{ ok: boolean }>(`/people/${id}`, { method: 'DELETE' });

export const fetchPosts = async () => (await request<Post[]>('/posts')).map(normalizePost);

export const addPost = (body: AddPostPayload) =>
  request<Post>('/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(normalizePost);

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
  existingRasarAssignments: RasarAssignment[] = [],
  existingEscort400Assignments: Escort400Assignment[] = [],
  kitchenSettings: KitchenSettings = { shifts: [{ id: 'default', start: '06:00', end: '21:00', required: 36 }] },
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
      existingRasarAssignments,
      existingEscort400Assignments,
      kitchenSettings,
      escortSettings,
      constraints,
    }),
  }).then(normalizeScheduleResponse);

export const generateGuardsSchedule = (
  startISO: string,
  endISO: string,
  shiftOverrides: { postId: number; day: string; shiftLabel: string; requiredPerShift: number }[] = [],
  esAssignments: ESGroupAssignment[] = [],
  existingAssignments: ExistingAssignment[] = [],
  existingBwAssignments: BWAssignment[] = [],
  existingKitchenAssignments: KitchenAssignment[] = [],
  existingEscortAssignments: EscortAssignment[] = [],
  existingRasarAssignments: RasarAssignment[] = [],
  existingEscort400Assignments: Escort400Assignment[] = [],
  kitchenSettings: KitchenSettings = { shifts: [{ id: 'default', start: '06:00', end: '21:00', required: 36 }] },
  escortSettings: EscortSettings = { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 },
  constraints: Constraint[] = [],
  allowPartial: boolean = false
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
      existingRasarAssignments,
      existingEscort400Assignments,
      kitchenSettings,
      escortSettings,
      constraints,
      allowPartial,
    }),
  }).then(normalizeScheduleResponse);

export const generateKitchenSchedule = (
  guardsStartISO: string,
  guardsEndISO: string,
  kitchenDay: string,
  esAssignments: ESGroupAssignment[] = [],
  existingAssignments: ExistingAssignment[] = [],
  existingBwAssignments: BWAssignment[] = [],
  existingKitchenAssignments: KitchenAssignment[] = [],
  existingEscortAssignments: EscortAssignment[] = [],
  existingRasarAssignments: RasarAssignment[] = [],
  existingEscort400Assignments: Escort400Assignment[] = [],
  kitchenSettings: KitchenSettings = { shifts: [{ id: 'default', start: '06:00', end: '21:00', required: 36 }] },
  escortSettings: EscortSettings = { requiredShift1: 4, requiredShift2: 4, requiredShift3: 4, requiredShift4: 4 },
  constraints: Constraint[] = [],
  allowPartial: boolean = false
) =>
  request<ScheduleResponse>('/schedule/generate-kitchen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startISO: guardsStartISO,
      endISO: guardsEndISO,
      kitchenDay,
      esAssignments,
      existingAssignments,
      existingBwAssignments,
      existingKitchenAssignments,
      existingEscortAssignments,
      existingRasarAssignments,
      existingEscort400Assignments,
      kitchenSettings,
      escortSettings,
      constraints,
      allowPartial,
    }),
  }).then(normalizeScheduleResponse);

export const clearSchedule = (mode: 'all' | 'guards' | 'kitchen' | 'rasar' = 'all') =>
  request<{ ok: boolean }>(`/schedule/clear?mode=${encodeURIComponent(mode)}`, { method: 'DELETE' });

export const fetchLastSchedule = () => request<ScheduleSnapshot>('/schedule/last');

export const fetchScheduleByDate = (date: string) =>
  request<ScheduleSnapshot>(`/schedule/history?date=${encodeURIComponent(date)}`);

export const fetchHistoryPeriods = () =>
  request<{ periods: { start: string; end: string }[] }>('/schedule/history-periods');

export const fetchScheduleByPeriod = (start: string, end: string) =>
  request<ScheduleSnapshot>(`/schedule/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);

export const generateRasarSchedule = (
  rasarStartISO: string,
  rasarEndISO: string,
  esAssignments: ESGroupAssignment[] = [],
  existingAssignments: Assignment[] = [],
  existingBwAssignments: BWAssignment[] = [],
  existingKitchenAssignments: KitchenAssignment[] = [],
  existingEscortAssignments: EscortAssignment[] = [],
  kitchenSettings: KitchenSettings,
  existingRasarAssignments: RasarAssignment[] = [],
  constraints: Constraint[] = [],
  rasarOverrides: RasarOverride[] = [],
  existingEscort400Assignments: Escort400Assignment[] = [],
  escort400Overrides: Escort400Override[] = [],
  allowPartial: boolean = false
) =>
  request<ScheduleResponse>('/schedule/generate-rasar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Server expects startISO/endISO; we also send rasarStartISO/rasarEndISO for backward compatibility.
      startISO: rasarStartISO,
      endISO: rasarEndISO,
      rasarStartISO,
      rasarEndISO,
      esAssignments,
      existingAssignments,
      existingBwAssignments,
      existingKitchenAssignments,
      existingEscortAssignments,
      kitchenSettings,
      existingRasarAssignments,
      constraints,
      rasarOverrides,
      existingEscort400Assignments,
      escort400Overrides,
      allowPartial,
    }),
  });

export const saveRasarSchedule = (rasarAssignments: RasarAssignment[], escort400Assignments: Escort400Assignment[]) =>
  request<{ ok: boolean; error?: string; violations?: Array<{ personId: number; message: string }> }>(
    '/schedule/save-rasar',
    {
      method: 'POST',
      body: JSON.stringify({ rasarAssignments, escort400Assignments }),
    }
  );

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

export const fetchJustice = (params: { mode: 'all' | 'range'; startISO?: string; endISO?: string }) => {
  const qs = new URLSearchParams();
  qs.set('mode', params.mode);
  if (params.mode === 'range') {
    if (params.startISO) qs.set('startISO', params.startISO);
    if (params.endISO) qs.set('endISO', params.endISO);
  }
  return request<{ rows: JusticeRow[] }>(`/schedule/justice?${qs.toString()}`);
};
