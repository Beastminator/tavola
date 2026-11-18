import type { Meal, Rating } from "@/db/schema";

export const MIN_SCORE = 1;
export const MAX_SCORE = 10;

export type ZorkasmSummary = {
  count: number;
  /** Average score rounded to one decimal, or null when nobody rated yet. */
  average: number | null;
};

export function summarizeRatings(ratings: Pick<Rating, "score">[]): ZorkasmSummary {
  if (ratings.length === 0) return { count: 0, average: null };
  const sum = ratings.reduce((s, r) => s + r.score, 0);
  return { count: ratings.length, average: Math.round((sum / ratings.length) * 10) / 10 };
}

/** "8.5" or "8" — drops a trailing ".0". */
export function formatScore(avg: number): string {
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
}

export function zorkasmLabel(avg: number): string {
  if (avg >= 9.5) return "Full Zorkasm 🤯";
  if (avg >= 8.5) return "Transcendent";
  if (avg >= 7.5) return "Delizioso";
  if (avg >= 6) return "Solid";
  if (avg >= 4) return "Fine";
  return "Rough night";
}

/** Meals can be rated once they've happened (today or earlier) and weren't cancelled. */
export function canRate(meal: Pick<Meal, "date" | "status">, today: string): boolean {
  return meal.status !== "cancelled" && meal.date <= today;
}
