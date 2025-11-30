import type { Assignment, ESGroupAssignment, Person, Post } from './types';

const BASE =
  import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');

const request = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(`${BASE}${path}`, init);
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
};

type AddPostPayload = {
  name: string;
  requiredPerShift: number;
};

type ExistingAssignment = Pick<Assignment, 'postId' | 'personId' | 'day' | 'shiftLabel'>;

type ScheduleResponse = {
  assignments?: Assignment[];
  error?: string;
};

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
  existingAssignments: ExistingAssignment[] = []
) =>
  request<ScheduleResponse>('/schedule/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startISO, endISO, shiftOverrides, esAssignments, existingAssignments }),
  });

export const clearSchedule = () => request<{ ok: boolean }>('/schedule/clear', { method: 'DELETE' });
