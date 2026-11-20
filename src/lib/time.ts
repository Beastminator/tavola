import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";

export const TZ = "Europe/Rome";

export const DEFAULT_DEADLINE = { lunch: "10:00", dinner: "16:00" } as const;

/** Rome time after which a meal counts as eaten: it leaves "next up" and moves to the after-meal nudges. */
export const MEAL_OVER = { lunch: "15:00", dinner: "23:00" } as const;

/** Today's date in Rome as YYYY-MM-DD. */
export function todayRome(now = new Date()): string {
  return formatInTimeZone(now, TZ, "yyyy-MM-dd");
}

/** The next `n` Rome-local dates starting today, as YYYY-MM-DD. */
export function nextDays(n: number, now = new Date()): string[] {
  const start = fromZonedTime(`${todayRome(now)}T12:00:00`, TZ);
  return Array.from({ length: n }, (_, i) => formatInTimeZone(addDays(start, i), TZ, "yyyy-MM-dd"));
}

/** Rome wall-clock date + "HH:mm" -> UTC Date. */
export function romeToUtc(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TZ);
}

/** True once the meal has (probably) been eaten. */
export function mealOver(meal: { date: string; slot: "lunch" | "dinner" }, now = new Date()): boolean {
  return now >= romeToUtc(meal.date, MEAL_OVER[meal.slot]);
}

export function formatRome(d: Date, fmt: string): string {
  return formatInTimeZone(d, TZ, fmt);
}

/** "Wed 18 Nov" for a YYYY-MM-DD date. */
export function formatDay(date: string, fmt = "EEE d MMM"): string {
  return formatInTimeZone(fromZonedTime(`${date}T12:00:00`, TZ), TZ, fmt);
}

export function relativeDay(date: string, now = new Date()): string | null {
  const [today, tomorrow] = nextDays(2, now);
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  return null;
}

/** Short human countdown like "2h 15m" or "3d". */
export function countdown(to: Date, now = new Date()): string {
  const mins = Math.round((to.getTime() - now.getTime()) / 60000);
  if (mins <= 0) return "closed";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
