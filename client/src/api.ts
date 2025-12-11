import type { Assignment, BWAssignment, ESGroupAssignment, Person, Post, Constraint } from './types';

const BASE =
  import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');

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
    const message = await response.text();
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
  error?: string;
};

type ScheduleSnapshot = {
  assignments: Assignment[];
  bwAssignments: BWAssignment[];
  esAssignments: ESGroupAssignment[];
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
      constraints,
    }),
  });

export const clearSchedule = () => request<{ ok: boolean }>('/schedule/clear', { method: 'DELETE' });

export const fetchLastSchedule = () => request<ScheduleSnapshot>('/schedule/last');
