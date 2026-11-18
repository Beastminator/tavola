import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { loadGroup, sortMeals } from "@/lib/data";
import { computeBalances, summarizeMeal } from "@/lib/ledger";
import { formatEuro } from "@/lib/money";
import { todayRome } from "@/lib/time";
import { MealCard } from "@/components/MealCard";
import { Avatar } from "@/components/Avatar";

export default async function MealsPage() {
  const me = await requireMember();
  const g = await loadGroup();
  const today = todayRome();
  const attendeesOf = (mealId: number) =>
    g.signups
      .filter((s) => s.mealId === mealId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((s) => g.memberById.get(s.memberId)!)
      .filter(Boolean);
  const upcoming = sortMeals(g.meals.filter((m) => m.date >= today));
  const past = sortMeals(g.meals.filter((m) => m.date < today), -1).slice(0, 20);
  const myBalance = computeBalances(g.ledger).get(me.id) ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Tavola</h1>
        <Link href="/me" className="flex items-center gap-2 text-sm text-muted">
          {me.name}
          <Avatar name={me.name} size={32} />
        </Link>
      </header>

      {me.kind !== "cook" && myBalance !== 0 && (
        <Link
          href="/balances"
          className={`card flex items-center justify-between p-4 ${myBalance < 0 ? "border-accent" : ""}`}
        >
          <span className="text-sm">{myBalance < 0 ? "You owe" : "You're owed"}</span>
          <span className={`font-display text-xl font-bold ${myBalance < 0 ? "text-accent" : "text-ok"}`}>
            {formatEuro(Math.abs(myBalance))} ›
          </span>
        </Link>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Coming up</h2>
          <Link href="/schedule" className="text-sm font-semibold text-accent">
            + Plan meals
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-muted">No meals planned.</p>
            <Link href="/schedule" className="btn-primary mt-3">
              Plan the week
            </Link>
          </div>
        ) : (
          upcoming.map((m) => (
            <MealCard key={m.id} meal={m} attendees={attendeesOf(m.id)} me={me} summary={summarizeMeal(m.id, g.ledger)} />
          ))
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Past</h2>
          {past.map((m) => (
            <MealCard
              key={m.id}
              meal={m}
              attendees={attendeesOf(m.id)}
              me={me}
              summary={summarizeMeal(m.id, g.ledger)}
              past
            />
          ))}
        </section>
      )}
    </div>
  );
}
