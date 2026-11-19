import Link from "next/link";
import type { Meal } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { loadGroup, sortMeals } from "@/lib/data";
import { computeBalances } from "@/lib/ledger";
import { formatEuro } from "@/lib/money";
import { formatDay, todayRome } from "@/lib/time";
import { MealRow, NextMealCard, joinLabel } from "@/components/MealCard";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/ui";
import { setAttendance } from "@/app/actions";

type Todo = { key: string; href: string; text: string; icon: string; ateMeal?: Meal };

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
  const upcoming = sortMeals(g.meals.filter((m) => m.date >= today && m.status !== "cancelled"));
  const [next, ...later] = upcoming;
  const myBalance = computeBalances(g.ledger).get(me.id) ?? 0;
  const label = (m: Meal) => `${m.slot === "lunch" ? "lunch" : "dinner"} ${formatDay(m.date)}`;
  const ate = (m: Meal) => g.signups.some((s) => s.mealId === m.id && s.memberId === me.id);

  // Nudges for meals in the past week, most recent first.
  const weekAgo = todayRome(new Date(Date.now() - 7 * 864e5));
  const yesterday = todayRome(new Date(Date.now() - 864e5));
  const recent = sortMeals(
    g.meals.filter((m) => m.status !== "cancelled" && m.date >= weekAgo && m.date < today),
    -1,
  );
  const todos: Todo[] = [];
  if (me.kind !== "cook") {
    for (const m of recent) {
      // Forgot to log yesterday's meal? One tap fixes it.
      if (!ate(m) && m.date >= yesterday) {
        todos.push({ key: `ate${m.id}`, href: `/meals/${m.id}`, icon: "🍽️", text: `Ate ${label(m)}?`, ateMeal: m });
      }
      if (!m.leftoversOfId && !g.expenses.some((e) => e.mealId === m.id && !e.voidedAt)) {
        todos.push({ key: `r${m.id}`, href: `/meals/${m.id}`, icon: "🛒", text: `Add the receipt for ${label(m)}` });
      }
      if (ate(m) && !g.ratings.some((r) => r.mealId === m.id && r.memberId === me.id)) {
        todos.push({ key: `z${m.id}`, href: `/meals/${m.id}`, icon: "🔥", text: `Rate ${label(m)}` });
      }
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Tavola</h1>
        <Link href="/me" className="flex items-center gap-2 text-sm text-muted">
          {me.name}
          <Avatar name={me.name} size={32} />
        </Link>
      </header>

      {next ? (
        <NextMealCard meal={next} attendees={attendeesOf(next.id)} me={me} />
      ) : (
        <div className="card p-6 text-center">
          <p className="text-muted">No meals planned.</p>
          <Link href="/schedule" className="btn-primary mt-3">
            Plan the week
          </Link>
        </div>
      )}

      {me.kind !== "cook" && myBalance !== 0 && (
        <Link href="/balances" className="flex items-center justify-between px-1 text-sm">
          <span className="text-muted">{myBalance < 0 ? "You owe" : "You're owed"}</span>
          <span className={`font-semibold ${myBalance < 0 ? "text-accent" : "text-ok"}`}>
            {formatEuro(Math.abs(myBalance))} ›
          </span>
        </Link>
      )}

      {todos.length > 0 && (
        <ul className="card divide-y divide-line">
          {todos.slice(0, 4).map((t) => (
            <li key={t.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span>{t.icon}</span>
              <Link href={t.href} className="flex-1">
                {t.text}
              </Link>
              {t.ateMeal ? (
                <form action={setAttendance}>
                  <input type="hidden" name="mealId" value={t.ateMeal.id} />
                  <input type="hidden" name="join" value="1" />
                  <SubmitButton className="btn-primary px-3 py-1.5 text-xs">{joinLabel(t.ateMeal)}</SubmitButton>
                </form>
              ) : (
                <Link href={t.href} className="text-muted">
                  ›
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {later.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-muted">Later</h2>
          <ul className="card divide-y divide-line">
            {later.slice(0, 8).map((m) => (
              <MealRow key={m.id} meal={m} attendees={attendeesOf(m.id)} me={me} />
            ))}
          </ul>
        </section>
      )}

      <div className="flex justify-between px-1 text-sm font-semibold text-accent">
        <Link href="/schedule">+ Plan meals</Link>
        <Link href="/history">Past meals ›</Link>
      </div>
    </div>
  );
}
