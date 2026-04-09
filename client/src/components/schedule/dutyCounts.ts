import dayjs from 'dayjs';
import type {
  Assignment,
  BWAssignment,
  KitchenAssignment,
  EscortAssignment,
  RasarAssignment,
  Escort400Assignment,
  Person,
} from '../../types';
import { BW_SLOT_DEFINITIONS } from './utils';

export type DutyCounts = {
  guards: number;
  bw: number;
  kitchen: number;
  escort: number;
  rasar: number;
  escort400: number;
};

const overlaps = (aStartISO: string, aEndISO: string, bStartISO: string, bEndISO: string) => {
  const aStart = dayjs(aStartISO).second(0).millisecond(0);
  const aEnd = dayjs(aEndISO).second(0).millisecond(0);
  const bStart = dayjs(bStartISO).second(0).millisecond(0);
  const bEnd = dayjs(bEndISO).second(0).millisecond(0);
  // adjacency is not overlap
  return aStart.isBefore(bEnd) && bStart.isBefore(aEnd);
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const guardRange = (a: Assignment) => {
  if (a.start && a.end) return { start: a.start, end: a.end };
  const m = (a.shiftLabel || '').match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return null;
  const sh = Number(m[1]);
  const sm = Number(m[2]);
  const eh = Number(m[3]);
  const em = Number(m[4]);
  const start = dayjs(`${a.day}T${pad2(sh)}:${pad2(sm)}:00`);
  let end = dayjs(`${a.day}T${pad2(eh)}:${pad2(em)}:00`);
  if (!end.isAfter(start)) end = end.add(1, 'day');
  return { start: start.toISOString(), end: end.toISOString() };
};

const bwRange = (bw: BWAssignment) => {
  if (bw.start && bw.end) return { start: bw.start, end: bw.end };
  const slot = BW_SLOT_DEFINITIONS.find(s => s.id === bw.slotId);
  if (!slot) return null;
  const start = dayjs(`${bw.day}T${pad2(slot.startHour)}:${pad2(slot.startMinute)}:00`);
  let end = dayjs(`${bw.day}T${pad2(slot.endHour)}:${pad2(slot.endMinute)}:00`);
  if (!end.isAfter(start)) end = end.add(1, 'day');
  return { start: start.toISOString(), end: end.toISOString() };
};

const rasarRange = (a: RasarAssignment) => {
  if (a.start && a.end) return { start: a.start, end: a.end };
  const def = a.shiftId === 'rasar_1'
    ? { start: '08:30', end: '11:30' }
    : a.shiftId === 'rasar_2'
      ? { start: '13:30', end: '17:30' }
      : a.shiftId === 'rasar_3'
        ? { start: '19:30', end: '20:30' }
        : null;
  if (!def) return null;
  const start = dayjs(`${a.day}T${def.start}:00`);
  const end = dayjs(`${a.day}T${def.end}:00`);
  return { start: start.toISOString(), end: end.toISOString() };
};

const escort400Range = (a: Escort400Assignment) => {
  if (a.start && a.end) return { start: a.start, end: a.end };
  const def = a.shiftId === 'escort400_1'
    ? { start: '08:00', end: '12:30' }
    : a.shiftId === 'escort400_2'
      ? { start: '12:30', end: '17:00' }
      : null;
  if (!def) return null;
  const start = dayjs(`${a.day}T${def.start}:00`);
  const end = dayjs(`${a.day}T${def.end}:00`);
  return { start: start.toISOString(), end: end.toISOString() };
};

export const buildDutyCountsByPerson = (params: {
  people: Person[];
  rangeStartISO: string;
  rangeEndISO: string;
  guardAssignments?: Assignment[];
  bwAssignments?: BWAssignment[];
  kitchenAssignments?: KitchenAssignment[];
  escortAssignments?: EscortAssignment[];
  rasarAssignments?: RasarAssignment[];
  escort400Assignments?: Escort400Assignment[];
}) => {
  const {
    people,
    rangeStartISO,
    rangeEndISO,
    guardAssignments = [],
    bwAssignments = [],
    kitchenAssignments = [],
    escortAssignments = [],
    rasarAssignments = [],
    escort400Assignments = [],
  } = params;

  const rangeStart = dayjs(rangeStartISO);
  const rangeEnd = dayjs(rangeEndISO);

  const out = new Map<number, DutyCounts>();
  for (const p of people) {
    out.set(p.id, { guards: 0, bw: 0, kitchen: 0, escort: 0, rasar: 0, escort400: 0 });
  }

  const incUnique = (personId: number, key: string, kind: keyof DutyCounts, seen: Map<string, Set<string>>) => {
    if (!out.has(personId)) return;
    if (!seen.has(kind)) seen.set(kind, new Set());
    const set = seen.get(kind)!;
    const k = `${personId}|${key}`;
    if (set.has(k)) return;
    set.add(k);
    out.get(personId)![kind] += 1;
  };

  const seen = new Map<string, Set<string>>();

  for (const a of guardAssignments) {
    const r = guardRange(a);
    if (!r) continue;
    if (!overlaps(r.start, r.end, rangeStart.toISOString(), rangeEnd.toISOString())) continue;
    incUnique(a.personId, `${a.day}|${a.shiftLabel}`, 'guards', seen);
  }

  for (const b of bwAssignments) {
    const r = bwRange(b);
    if (!r) continue;
    if (!overlaps(r.start, r.end, rangeStart.toISOString(), rangeEnd.toISOString())) continue;
    incUnique(b.personId, `${b.day}|${b.slotId}`, 'bw', seen);
  }

  for (const k of kitchenAssignments) {
    if (!k.start || !k.end) continue;
    if (!overlaps(k.start, k.end, rangeStart.toISOString(), rangeEnd.toISOString())) continue;
    incUnique(k.personId, `${k.day}|${k.shiftId}`, 'kitchen', seen);
  }

  for (const e of escortAssignments) {
    if (!e.start || !e.end) continue;
    if (!overlaps(e.start, e.end, rangeStart.toISOString(), rangeEnd.toISOString())) continue;
    incUnique(e.personId, `${e.day}|${e.shiftId}`, 'escort', seen);
  }

  for (const r of rasarAssignments) {
    const rr = rasarRange(r);
    if (!rr) continue;
    if (!overlaps(rr.start, rr.end, rangeStart.toISOString(), rangeEnd.toISOString())) continue;
    incUnique(r.personId, `${r.day}|${r.shiftId}`, 'rasar', seen);
  }

  for (const a of escort400Assignments) {
    const rr = escort400Range(a);
    if (!rr) continue;
    if (!overlaps(rr.start, rr.end, rangeStart.toISOString(), rangeEnd.toISOString())) continue;
    incUnique(a.personId, `${a.day}|${a.shiftId}`, 'escort400', seen);
  }

  return out;
};


