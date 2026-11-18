import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireMember } from "@/lib/auth";
import { loadGroup } from "@/lib/data";
import { summarizeMeal } from "@/lib/ledger";
import { formatEuro } from "@/lib/money";
import { formatDay, formatRome, relativeDay } from "@/lib/time";
import { setAttendance, setMealCancelled, voidExpense } from "@/app/actions";
import { SlotBadge } from "@/components/MealCard";
import { Avatar } from "@/components/Avatar";
import { PayCard } from "@/components/PayCard";
import { ExpenseForm, MealEditForm } from "@/components/forms";
import { SubmitButton } from "@/components/ui";

export default async function MealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember();
  const g = await loadGroup();
  const meal = g.meals.find((m) => m.id === Number(id));
  if (!meal) notFound();

  const summary = summarizeMeal(meal.id, g.ledger);
  const signups = g.signups
    .filter((s) => s.mealId === meal.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const attendees = signups.map((s) => g.memberById.get(s.memberId)!).filter(Boolean);
  const notAttending = g.members.filter((m) => !signups.some((s) => s.memberId === m.id) && m.kind !== "cook");
  const joined = attendees.some((a) => a.id === me.id);
  const locked = new Date() >= meal.signupDeadline;
  const cancelled = meal.status === "cancelled";
  const isCook = me.kind === "cook";
  const eaters = attendees.filter((a) => a.kind !== "cook").length;
  const expenses = g.expenses.filter((e) => e.mealId === meal.id);
  const payers = g.members.filter((m) => m.kind !== "cook");
  const title = `${meal.slot === "lunch" ? "Lunch" : "Dinner"} ${formatDay(meal.date)}`;
  const reference = `Tavola ${meal.slot} ${formatDay(meal.date, "dd/MM")}`;

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const shareText = `🍝 ${title}${meal.notes ? ` — ${meal.notes}` : ""}\nSign up by ${formatRome(meal.signupDeadline, "EEE HH:mm")}: ${origin}/meals/${meal.id}`;

  const myDebts = summary.debts.filter((d) => d.fromId === me.id && d.paidCents < d.amountCents);
  const owedToMe = summary.debts.filter((d) => d.toId === me.id && d.paidCents < d.amountCents);

  return (
    <div className="space-y-5">
      <header>
        <Link href="/" className="text-sm text-muted">
          ‹ Meals
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <SlotBadge slot={meal.slot} />
          {cancelled && <span className="chip bg-bad-soft text-bad">Cancelled</span>}
          {!cancelled && locked && <span className="chip bg-line text-muted">Sign-up closed</span>}
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold">
          {relativeDay(meal.date) ? `${relativeDay(meal.date)}, ` : ""}
          {formatDay(meal.date, "EEEE d MMMM")}
        </h1>
        {meal.notes && <p className="mt-1">{meal.notes}</p>}
        <p className="mt-1 text-sm text-muted">
          Sign-up {locked ? "closed" : "closes"} {formatRome(meal.signupDeadline, "EEE d MMM, HH:mm")}
        </p>
      </header>

      {isCook && !cancelled && (
        <div className="card bg-accent-soft p-5 text-center">
          <p className="text-sm text-accent">Cook for</p>
          <p className="font-display text-5xl font-bold text-accent">{eaters + 1}</p>
          <p className="text-sm text-accent">
            {eaters} {eaters === 1 ? "person" : "people"} + you
          </p>
        </div>
      )}

      {/* Attendance */}
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">
            Who&apos;s eating <span className="text-muted">({eaters})</span>
          </h2>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            Share on WhatsApp
          </a>
        </div>
        {attendees.length === 0 && <p className="text-sm text-muted">Nobody yet.</p>}
        <ul className="space-y-1">
          {attendees.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-1">
              <Avatar name={a.name} size={30} />
              <span className="flex-1">
                {a.name}
                {a.id === me.id && <span className="text-muted"> (me)</span>}
                {a.kind === "guest" && <span className="chip ml-2 bg-line text-muted">guest</span>}
                {a.kind === "cook" && <span className="chip ml-2 bg-ok-soft text-ok">cook · free</span>}
              </span>
              {summary.shareByMember.get(a.id) !== undefined && (
                <span className="text-sm font-semibold">{formatEuro(summary.shareByMember.get(a.id)!)}</span>
              )}
              <form action={setAttendance}>
                <input type="hidden" name="mealId" value={meal.id} />
                <input type="hidden" name="memberId" value={a.id} />
                <input type="hidden" name="join" value="0" />
                <SubmitButton className="px-2 text-lg text-muted" aria-label={`Remove ${a.name}`}>
                  ×
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>

        {!cancelled && (
          <div className="mt-3 space-y-2">
            {!isCook && !joined && (
              <form action={setAttendance}>
                <input type="hidden" name="mealId" value={meal.id} />
                <input type="hidden" name="join" value="1" />
                <SubmitButton className="btn-primary w-full">{locked ? "Join (late)" : "I'm in"}</SubmitButton>
              </form>
            )}
            {locked && <p className="text-xs text-warn">Sign-up closed — late changes still count, but tell the cook!</p>}
            {notAttending.filter((m) => m.id !== me.id).length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-accent">+ Add someone else</summary>
                <form action={setAttendance} className="mt-2 flex gap-2">
                  <input type="hidden" name="mealId" value={meal.id} />
                  <input type="hidden" name="join" value="1" />
                  <select name="memberId" className="field">
                    {notAttending
                      .filter((m) => m.id !== me.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  <SubmitButton className="btn-ghost">Add</SubmitButton>
                </form>
                <p className="mt-1 text-xs text-muted">
                  New guests open the invite link themselves so they get their own payment.
                </p>
              </details>
            )}
          </div>
        )}
      </section>

      {/* Money */}
      {!isCook && (
        <section className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Groceries</h2>
            <span className="font-display text-xl font-bold">{formatEuro(summary.totalCents)}</span>
          </div>
          {summary.unsplittable && (
            <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
              Nobody is signed up, so this can&apos;t be split yet. Add the people who ate.
            </p>
          )}
          {summary.attendees.length > 0 && summary.totalCents > 0 && (
            <p className="text-sm text-muted">
              Split between {summary.attendees.length} {summary.attendees.length === 1 ? "person" : "people"} (cook eats
              free)
            </p>
          )}
          <ul className="divide-y divide-line">
            {expenses.map((e) => (
              <li key={e.id} className={`flex items-center gap-3 py-2 ${e.voidedAt ? "opacity-50" : ""}`}>
                <span className="flex-1 text-sm">
                  <span className={`font-semibold ${e.voidedAt ? "line-through" : ""}`}>
                    {formatEuro(e.amountCents)}
                  </span>{" "}
                  paid by {g.memberById.get(e.payerId)?.name}
                  {e.note && <span className="block text-xs text-muted">{e.note}</span>}
                </span>
                {e.voidedAt ? (
                  <span className="text-xs text-muted">removed</span>
                ) : (
                  <form action={voidExpense}>
                    <input type="hidden" name="expenseId" value={e.id} />
                    <SubmitButton className="text-xs font-semibold text-bad">Remove</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <details open={expenses.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold text-accent">+ Add groceries receipt</summary>
            <div className="mt-3">
              <ExpenseForm mealId={meal.id} me={me} members={payers} />
            </div>
          </details>
        </section>
      )}

      {!isCook && summary.debts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Payments for this meal</h2>
          {myDebts.map((d) => (
            <PayCard
              key={`${d.fromId}-${d.toId}`}
              from={me}
              to={g.memberById.get(d.toId)!}
              amountCents={d.amountCents - d.paidCents}
              mealId={meal.id}
              reference={reference}
              viewerId={me.id}
            />
          ))}
          {owedToMe.map((d) => (
            <PayCard
              key={`${d.fromId}-${d.toId}`}
              from={g.memberById.get(d.fromId)!}
              to={me}
              amountCents={d.amountCents - d.paidCents}
              mealId={meal.id}
              reference={reference}
              viewerId={me.id}
            />
          ))}
          <div className="card divide-y divide-line">
            {summary.debts.map((d) => {
              const paid = d.paidCents >= d.amountCents;
              return (
                <div key={`${d.fromId}-${d.toId}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="flex-1">
                    {g.memberById.get(d.fromId)?.name} → {g.memberById.get(d.toId)?.name}
                  </span>
                  <span className="font-semibold">{formatEuro(d.amountCents)}</span>
                  <span className={`chip ${paid ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
                    {paid ? "paid" : d.paidCents > 0 ? `${formatEuro(d.amountCents - d.paidCents)} left` : "unpaid"}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            Prefer to settle everything at once? Use the <Link href="/balances" className="underline">Money</Link> tab.
          </p>
        </section>
      )}

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Edit meal</summary>
        <div className="mt-3 space-y-3">
          <MealEditForm
            mealId={meal.id}
            deadlineDate={formatRome(meal.signupDeadline, "yyyy-MM-dd")}
            deadlineTime={formatRome(meal.signupDeadline, "HH:mm")}
            notes={meal.notes ?? ""}
          />
          <form action={setMealCancelled}>
            <input type="hidden" name="mealId" value={meal.id} />
            <input type="hidden" name="cancel" value={cancelled ? "0" : "1"} />
            <SubmitButton className={cancelled ? "btn-ghost w-full" : "btn w-full bg-bad-soft text-bad"}>
              {cancelled ? "Re-open meal" : "Cancel meal"}
            </SubmitButton>
          </form>
        </div>
      </details>
    </div>
  );
}
