import "server-only";
import { getDb, schema } from "@/db";
import type { Meal, Member } from "@/db/schema";
import { formatDay } from "./time";

export const mealLabel = (m: Pick<Meal, "slot" | "date">) => `${m.slot} ${formatDay(m.date)}`;

/** Signs `target` up for `meal` (no-op if already in) and logs it. Returns true if a new sign-up was made. */
export async function joinMeal(actor: Member, target: Member, meal: Meal, via?: string): Promise<boolean> {
  const db = await getDb();
  const inserted = await db
    .insert(schema.signups)
    .values({ mealId: meal.id, memberId: target.id })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) return false;
  const late = new Date() > meal.signupDeadline;
  const who = target.id === actor.id ? `${actor.name} joined` : `${actor.name} added ${target.name} to`;
  await db.insert(schema.activity).values({
    actorId: actor.id,
    type: "signup",
    payload: { text: `${who} ${mealLabel(meal)}${late ? " (late)" : ""}${via ? ` ${via}` : ""}`, mealId: meal.id },
  });
  return true;
}

/** Only allow redirects back into the app to a meal or the scan-to-eat link. */
export function safeNext(next: string | null | undefined): string | null {
  return next && /^\/(eat|meals)\/\d+$/.test(next) ? next : null;
}
