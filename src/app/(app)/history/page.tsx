import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { loadGroup, sortMeals } from "@/lib/data";
import { formatDay, todayRome } from "@/lib/time";
import { formatScore, summarizeRatings, zorkasmLabel } from "@/lib/zorkasm";
import { SlotBadge } from "@/components/MealCard";
import { ZorkasmChip } from "@/components/Zorkasm";

export default async function HistoryPage() {
  const me = await requireMember();
  const g = await loadGroup();
  const today = todayRome();

  const past = sortMeals(
    g.meals.filter((m) => m.status !== "cancelled" && m.date <= today),
    -1,
  ).map((meal) => {
    const ratings = g.ratings.filter((r) => r.mealId === meal.id);
    const eaters = g.signups.filter(
      (s) => s.mealId === meal.id && g.memberById.get(s.memberId)?.kind !== "cook",
    ).length;
    // Highlight the most enthusiastic written review.
    const topReview = [...ratings].filter((r) => r.review).sort((a, b) => b.score - a.score)[0];
    return { meal, ratings, eaters, zorkasm: summarizeRatings(ratings), topReview };
  });

  const rated = past.filter((p) => p.zorkasm.average !== null);
  const allTime = summarizeRatings(g.ratings.filter((r) => past.some((p) => p.meal.id === r.mealId)));
  const hallOfFame = [...rated]
    .sort((a, b) => b.zorkasm.average! - a.zorkasm.average! || b.zorkasm.count - a.zorkasm.count)
    .slice(0, 3);
  const myRatings = g.ratings.filter((r) => r.memberId === me.id);
  const unratedByMe = me.kind === "cook" ? 0 : past.filter((p) => !p.ratings.some((r) => r.memberId === me.id)).length;

  // Group by month, newest first.
  const months = new Map<string, typeof past>();
  for (const p of past) {
    const key = p.meal.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), p]);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">History</h1>
        <p className="text-sm text-muted">Every meal and its Zorkasm score</p>
      </header>

      {past.length === 0 ? (
        <div className="card p-6 text-center text-muted">No meals yet. Come back after the first one 🍝</div>
      ) : (
        <>
          <section className="card grid grid-cols-3 divide-x divide-line text-center">
            <div className="p-3">
              <p className="font-display text-2xl font-bold">{past.length}</p>
              <p className="text-xs text-muted">meals</p>
            </div>
            <div className="p-3">
              <p className="font-display text-2xl font-bold text-accent">
                {allTime.average === null ? "–" : formatScore(allTime.average)}
              </p>
              <p className="text-xs text-muted">avg Zorkasm</p>
            </div>
            <div className="p-3">
              <p className="font-display text-2xl font-bold">{allTime.count}</p>
              <p className="text-xs text-muted">ratings</p>
            </div>
          </section>

          {unratedByMe > 0 && (
            <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
              You haven&apos;t rated {unratedByMe} {unratedByMe === 1 ? "meal" : "meals"} yet. Tap one below to give
              it a score.
            </p>
          )}

          {hallOfFame.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">🏆 Hall of fame</h2>
              <ol className="card divide-y divide-line">
                {hallOfFame.map((p, i) => (
                  <li key={p.meal.id}>
                    <Link href={`/meals/${p.meal.id}`} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-2xl">{["🥇", "🥈", "🥉"][i]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {p.meal.notes || `${p.meal.slot === "lunch" ? "Lunch" : "Dinner"}`}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDay(p.meal.date)} · {zorkasmLabel(p.zorkasm.average!)}
                        </span>
                      </span>
                      <span className="font-display text-xl font-bold text-accent">
                        {formatScore(p.zorkasm.average!)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {[...months.entries()].map(([month, items]) => (
            <section key={month} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                {formatDay(`${month}-15`, "MMMM yyyy")}
              </h2>
              <ul className="space-y-2">
                {items.map((p) => {
                  const mine = p.ratings.find((r) => r.memberId === me.id);
                  return (
                    <li key={p.meal.id}>
                      <Link href={`/meals/${p.meal.id}`} className="card block p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <SlotBadge slot={p.meal.slot} />
                            <span className="font-display font-bold">{formatDay(p.meal.date)}</span>
                          </div>
                          {p.zorkasm.average !== null ? (
                            <ZorkasmChip summary={p.zorkasm} />
                          ) : (
                            <span className="chip bg-line text-muted">not rated</span>
                          )}
                        </div>
                        {p.meal.notes && <p className="mt-2 font-semibold">{p.meal.notes}</p>}
                        {p.topReview && (
                          <p className="mt-1 line-clamp-2 text-sm italic text-muted">
                            “{p.topReview.review}” — {g.memberById.get(p.topReview.memberId)?.name}
                          </p>
                        )}
                        <p className="mt-2 text-xs text-muted">
                          {p.eaters} {p.eaters === 1 ? "person" : "people"} ate · {p.zorkasm.count}{" "}
                          {p.zorkasm.count === 1 ? "rating" : "ratings"}
                          {mine ? ` · you gave ${mine.score}` : me.kind !== "cook" ? " · tap to rate" : ""}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {myRatings.length > 0 && (
            <p className="text-center text-xs text-muted">
              Your average Zorkasm given: {formatScore(summarizeRatings(myRatings).average!)} across {myRatings.length}{" "}
              {myRatings.length === 1 ? "meal" : "meals"}
            </p>
          )}
        </>
      )}
    </div>
  );
}
