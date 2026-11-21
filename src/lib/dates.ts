// Asia/Dhaka has a fixed +06:00 offset (no DST), so plain arithmetic is safe.
export const TIME_ZONE = "Asia/Dhaka";
export const TZ_OFFSET = "+06:00";
const OFFSET_MS = 6 * 60 * 60 * 1000;

export interface YMD {
  y: number;
  m: number;
  d: number;
}

export interface HM {
  h: number;
  min: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dhakaToday(now: Date = new Date()): YMD {
  const t = new Date(now.getTime() + OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function addDays(date: YMD, days: number): YMD {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** 0 = Sunday. */
export function weekdayOf(date: YMD): number {
  return new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay();
}

export function isValidYMD(date: YMD): boolean {
  if (date.m < 1 || date.m > 12 || date.d < 1 || date.d > 31) return false;
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d));
  return t.getUTCMonth() === date.m - 1 && t.getUTCDate() === date.d;
}

export function compareYMD(a: YMD, b: YMD): number {
  return Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d);
}

export function formatYMD(date: YMD): string {
  return `${date.y}-${pad(date.m)}-${pad(date.d)}`;
}

export function buildDue(date: YMD, time?: HM | null): string {
  const day = formatYMD(date);
  return time ? `${day}T${pad(time.h)}:${pad(time.min)}:00${TZ_OFFSET}` : day;
}

export function hasTime(due: string): boolean {
  return due.includes("T");
}

/** The instant a deadline passes. Date-only deadlines pass at the end of that day in Dhaka. */
export function dueInstant(due: string): Date {
  if (hasTime(due)) return new Date(due);
  return new Date(`${due}T23:59:59${TZ_OFFSET}`);
}

/** Date and time parts of a deadline as seen in Dhaka, for form inputs. */
export function splitDue(due: string | null): { date: string; time: string } {
  if (!due) return { date: "", time: "" };
  if (!hasTime(due)) return { date: due, time: "" };
  const t = new Date(new Date(due).getTime() + OFFSET_MS);
  if (Number.isNaN(t.getTime())) return { date: "", time: "" };
  return {
    date: formatYMD({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }),
    time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`,
  };
}

export function joinDue(date: string, time: string): string | null {
  if (!date) return null;
  return time ? `${date}T${time}:00${TZ_OFFSET}` : date;
}

export function formatDue(due: string | null): string {
  if (!due) return "No deadline";
  const instant = hasTime(due) ? new Date(due) : new Date(`${due}T12:00:00${TZ_OFFSET}`);
  if (Number.isNaN(instant.getTime())) return due;
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(instant);
  if (!hasTime(due)) return day;
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
  return `${day}, ${time}`;
}

export type UrgencyLevel = "overdue" | "today" | "soon" | "later" | "none" | "done";

export interface Urgency {
  level: UrgencyLevel;
  label: string;
}

export function urgencyOf(due: string | null, completed: boolean, now: Date = new Date()): Urgency {
  if (completed) return { level: "done", label: "Done" };
  if (!due) return { level: "none", label: "No date" };
  if (dueInstant(due).getTime() < now.getTime()) return { level: "overdue", label: "Overdue" };
  const today = dhakaToday(now);
  const dueDay = dhakaToday(hasTime(due) ? new Date(due) : new Date(`${due}T12:00:00${TZ_OFFSET}`));
  const days = Math.round(compareYMD(dueDay, today) / 86_400_000);
  if (days <= 0) return { level: "today", label: "Due today" };
  if (days === 1) return { level: "soon", label: "Tomorrow" };
  if (days <= 3) return { level: "soon", label: `In ${days} days` };
  return { level: "later", label: `In ${days} days` };
}
