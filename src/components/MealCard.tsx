import Link from "next/link";
import type { Meal, Member } from "@/db/schema";
import { countdown, formatDay, formatRome, relativeDay, todayRome } from "@/lib/time";
import { setAttendance } from "@/app/actions";
import { AvatarStack } from "./Avatar";
import { SubmitButton } from "./ui";

export function SlotBadge({ slot }: { slot: Meal["slot"] }) {
  return (
    <span className={`chip ${slot === "lunch" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>
      {slot === "lunch" ? "☀️ Lunch" : "🌙 Dinner"}
    </span>
  );
}

/** What the join button says: plan ahead, eating now, or logging after the fact. */
export function joinLabel(meal: Meal, now = new Date()): string {
  const today = todayRome(now);
  if (meal.date < today) return "I ate this";
  if (now >= meal.signupDeadline) return meal.date === today ? "I'm eating" : "Join (late)";
  return "I'm in";
}

function JoinForm({ meal, join, children, className }: { meal: Meal; join: boolean; children: React.ReactNode; className: string }) {
  return (
    <form action={setAttendance}>
      <input type="hidden" name="mealId" value={meal.id} />
      <input type="hidden" name="join" value={join ? "1" : "0"} />
      <SubmitButton className={className} pendingText="…">
        {children}
      </SubmitButton>
    </form>
  );
}

const title = (meal: Meal) => `${relativeDay(meal.date) ?? formatDay(meal.date, "EEE d MMM")} · ${meal.slot === "lunch" ? "Lunch" : "Dinner"}`;

/** The big card for the next meal: who's in and one big button. */
export function NextMealCard({ meal, attendees, me }: { meal: Meal; attendees: Member[]; me: Member }) {
  const now = new Date();
  const joined = attendees.some((a) => a.id === me.id);
  const eaters = attendees.filter((a) => a.kind !== "cook").length;
  const isCook = me.kind === "cook";
  return (
    <article className="card overflow-hidden">
      <Link href={`/meals/${meal.id}`} className="block p-5 pb-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-muted">{meal.slot === "lunch" ? "☀️" : "🌙"} Next up</p>
          <span className="text-sm text-muted">Details ›</span>
        </div>
        <h2 className="mt-1 font-display text-3xl font-bold">{title(meal)}</h2>
        {meal.leftoversOfId && <p className="mt-1 text-sm font-semibold text-ok">🍲 Leftovers</p>}
        {meal.notes && <p className="mt-1">{meal.notes}</p>}
        {isCook && !meal.leftoversOfId ? (
          <p className="mt-3 font-display text-2xl font-bold text-accent">Cook for {eaters + 1}</p>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <AvatarStack names={attendees.map((a) => a.name)} />
            <span className="text-sm text-muted">{eaters === 0 ? "Nobody yet" : `${eaters} eating`}</span>
          </div>
        )}
      </Link>
      {!isCook && (
        <div className="space-y-2 border-t border-line p-4">
          {joined ? (
            <div className="flex items-center gap-3">
              <span className="flex-1 text-lg font-semibold text-ok">✓ You&apos;re in</span>
              <JoinForm meal={meal} join={false} className="btn-ghost px-3 py-1.5 text-xs">
                Can&apos;t make it
              </JoinForm>
            </div>
          ) : (
            <JoinForm meal={meal} join className="btn-primary w-full py-3.5 text-lg">
              {joinLabel(meal, now)}
            </JoinForm>
          )}
          <p className="text-center text-xs text-muted">
            {now >= meal.signupDeadline
              ? "Sign-up closed. Late changes still count."
              : `Sign-up closes in ${countdown(meal.signupDeadline, now)} (${formatRome(meal.signupDeadline, "EEE HH:mm")})`}
          </p>
        </div>
      )}
    </article>
  );
}

/** One compact line per meal: day, count, and a one-tap join. */
export function MealRow({ meal, attendees, me }: { meal: Meal; attendees: Member[]; me: Member }) {
  const joined = attendees.some((a) => a.id === me.id);
  const eaters = attendees.filter((a) => a.kind !== "cook").length;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link href={`/meals/${meal.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="text-lg">{meal.leftoversOfId ? "🍲" : meal.slot === "lunch" ? "☀️" : "🌙"}</span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{title(meal)}</span>
          <span className="block truncate text-xs text-muted">
            {me.kind === "cook" && !meal.leftoversOfId ? `Cook for ${eaters + 1}` : `${eaters} eating`}
            {meal.notes ? ` · ${meal.notes}` : ""}
          </span>
        </span>
      </Link>
      {me.kind !== "cook" &&
        (joined ? (
          <span className="chip bg-ok-soft text-ok">✓ In</span>
        ) : (
          <JoinForm meal={meal} join className="btn-primary px-3 py-1.5 text-xs">
            {joinLabel(meal)}
          </JoinForm>
        ))}
    </li>
  );
}
