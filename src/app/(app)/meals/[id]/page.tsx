import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { inviteToken } from "@/lib/session";
import type { Meal, Member } from "@/db/schema";
import { requireMember } from "@/lib/auth";
import { loadGroup, sortMeals } from "@/lib/data";
import { summarizeMeal, type MealSummary } from "@/lib/ledger";
import { leftoverSlots } from "@/lib/leftovers";
import { formatEuro } from "@/lib/money";
import { formatDay, formatRome, relativeDay, todayRome } from "@/lib/time";
import { canRate, summarizeRatings } from "@/lib/zorkasm";
import {
  deleteMeal,
  linkLeftovers,
  removeRating,
  setAttendance,
  setMealCancelled,
  unlinkLeftovers,
  voidExpense,
} from "@/app/actions";
import { ReviewList, ZorkasmScore } from "@/components/Zorkasm";
import { SlotBadge, joinLabel } from "@/components/MealCard";
import { Avatar } from "@/components/Avatar";
import { PayCard } from "@/components/PayCard";
import { ExpenseForm, MealEditForm, NewPersonForm, RatingForm } from "@/components/forms";
import { SubmitButton } from "@/components/ui";

const shortLabel = (m: Pick<Meal, "date" | "slot">) => `${m.slot === "lunch" ? "Lunch" : "Dinner"} ${formatDay(m.date)}`;

export default async function MealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ate?: string }>;
}) {
  const { id } = await params;
  const { ate } = await searchParams;
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
  const title = shortLabel(meal);
  const reference = (m: Meal) => `Tavola ${m.slot} ${formatDay(m.date, "dd/MM")}`;

  // Leftovers: either this meal is leftovers of `source`, or it has leftover meals of its own.
  const source = meal.leftoversOfId ? g.meals.find((m) => m.id === meal.leftoversOfId) : undefined;
  const sourceSummary = source ? summarizeMeal(source.id, g.ledger) : undefined;
  const leftoverMeals = sortMeals(g.meals.filter((m) => m.leftoversOfId === meal.id && m.status !== "cancelled"));
  const mealAt = new Map(g.meals.map((m) => [`${m.date}:${m.slot}`, m]));
  const leftoverOptions = source
    ? []
    : leftoverSlots(meal)
        .map((s) => ({ ...s, existing: mealAt.get(`${s.date}:${s.slot}`) }))
        .filter(({ existing: e }) => !e || (!e.leftoversOfId && !g.meals.some((m) => m.leftoversOfId === e.id)));
  const hasLeftovers = leftoverMeals.length > 0;

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  // Scanning this logs "I ate here". It goes through the invite link so phones that aren't in the group yet can join.
  const eatUrl = `${origin}/join/${encodeURIComponent(inviteToken())}?next=/eat/${meal.id}`;
  const eatQr = cancelled
    ? null
    : await QRCode.toDataURL(eatUrl, { errorCorrectionLevel: "M", margin: 1, width: 520 });
  const shareText = `🍝 ${title}${source ? ` (leftovers)` : ""}${meal.notes ? ` — ${meal.notes}` : ""}\nSign up by ${formatRome(meal.signupDeadline, "EEE HH:mm")}: ${origin}/meals/${meal.id}`;

  const rateable = canRate(meal, todayRome());
  const ratings = g.ratings.filter((r) => r.mealId === meal.id);
  const zorkasm = summarizeRatings(ratings);
  const myRating = ratings.find((r) => r.memberId === me.id);
  const name = (memberId: number) => g.memberById.get(memberId)?.name ?? "Someone";

  return (
    <div className="space-y-5">
      <header>
        <Link href="/" className="text-sm text-muted">
          ‹ Meals
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SlotBadge slot={meal.slot} />
          {source && <span className="chip bg-ok-soft text-ok">🍲 Leftovers</span>}
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

      {ate === "1" && joined && (
        <div className="card flex items-center gap-3 bg-ok-soft p-4">
          <span className="text-2xl">✅</span>
          <p className="flex-1 font-semibold text-ok">Logged: you ate this meal. Buon appetito!</p>
          <form action={setAttendance}>
            <input type="hidden" name="mealId" value={meal.id} />
            <input type="hidden" name="join" value="0" />
            <SubmitButton className="text-xs font-semibold text-muted underline">Undo</SubmitButton>
          </form>
        </div>
      )}
      {ate === "already" && joined && (
        <p className="card bg-ok-soft p-4 font-semibold text-ok">✓ You were already down for this one.</p>
      )}
      {ate === "cancelled" && (
        <p className="card bg-bad-soft p-4 font-semibold text-bad">This meal was cancelled, so nothing was logged.</p>
      )}

      {/* The one thing most people come here to do. */}
      {!cancelled && !isCook && (
        <div className="space-y-2">
          {joined ? (
            <div className="card flex items-center gap-3 p-3 pl-4">
              <span className="flex-1 font-semibold text-ok">✓ You&apos;re in</span>
              <form action={setAttendance}>
                <input type="hidden" name="mealId" value={meal.id} />
                <input type="hidden" name="join" value="0" />
                <SubmitButton className="btn-ghost px-3 py-1.5 text-xs">Can&apos;t make it</SubmitButton>
              </form>
            </div>
          ) : (
            <form action={setAttendance}>
              <input type="hidden" name="mealId" value={meal.id} />
              <input type="hidden" name="join" value="1" />
              <SubmitButton className="btn-primary w-full py-3 text-base">{joinLabel(meal)}</SubmitButton>
            </form>
          )}
          {locked && <p className="text-xs text-warn">Sign-up closed. Late changes still count, but tell the cook!</p>}
        </div>
      )}

      {source && (
        <section className="card space-y-2 bg-ok-soft p-4">
          <p>
            🍲 Leftovers from{" "}
            <Link href={`/meals/${source.id}`} className="font-semibold underline">
              {shortLabel(source)}
            </Link>
          </p>
          <p className="text-sm text-muted">
            Its groceries are split by portion across everyone who ate either meal. Eat both and you pay for two
            portions.
          </p>
          <form action={unlinkLeftovers}>
            <input type="hidden" name="mealId" value={meal.id} />
            <SubmitButton className="text-xs font-semibold text-muted underline">Not leftovers? Unmark</SubmitButton>
          </form>
        </section>
      )}

      {isCook && !cancelled && !source && (
        <div className="card bg-accent-soft p-5 text-center">
          <p className="text-sm text-accent">Cook for</p>
          <p className="font-display text-5xl font-bold text-accent">{eaters + 1}</p>
          <p className="text-sm text-accent">
            {eaters} {eaters === 1 ? "person" : "people"} + you
          </p>
          {hasLeftovers && (
            <p className="mt-2 text-sm text-accent">
              + leftovers for {leftoverMeals.map((m) => shortLabel(m)).join(", ")}
            </p>
          )}
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
              {!hasLeftovers && summary.shareByMember.get(a.id) !== undefined && (
                <span className="text-sm font-semibold">{formatEuro(summary.shareByMember.get(a.id)!)}</span>
              )}
              {a.id === me.id && (
                <form action={setAttendance}>
                  <input type="hidden" name="mealId" value={meal.id} />
                  <input type="hidden" name="join" value="0" />
                  <SubmitButton className="px-2 text-lg text-muted" aria-label="Remove me">
                    ×
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>

        {!cancelled && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-accent">Add or remove someone</summary>
            <div className="mt-2 space-y-2">
              {notAttending.some((m) => m.id !== me.id) && (
                <form action={setAttendance} className="flex gap-2">
                  <input type="hidden" name="mealId" value={meal.id} />
                  <input type="hidden" name="join" value="1" />
                  <select name="memberId" className="field" aria-label="Person to add">
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
              )}
              {attendees.some((a) => a.id !== me.id) && (
                <form action={setAttendance} className="flex gap-2">
                  <input type="hidden" name="mealId" value={meal.id} />
                  <input type="hidden" name="join" value="0" />
                  <select name="memberId" className="field" aria-label="Person to remove">
                    {attendees
                      .filter((a) => a.id !== me.id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                  <SubmitButton className="btn-ghost text-bad">Remove</SubmitButton>
                </form>
              )}
              <div className="border-t border-line pt-2">
                <p className="mb-1 text-xs font-semibold text-muted">Not in the app yet?</p>
                <NewPersonForm mealId={meal.id} />
                <p className="mt-1 text-xs text-muted">
                  Their share is counted right away. When they open the invite link later, they just pick their name.
                </p>
              </div>
            </div>
          </details>
        )}
      </section>

      {eatQr && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold">📷 QR code: scan to log eating</summary>
          <div className="mt-3 flex flex-col items-center gap-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={eatQr} alt={`QR code to log eating ${title}`} width={260} height={260} className="rounded-xl bg-white p-2" />
            <p className="text-sm">
              Show this at the table. Anyone who scans it with their phone camera is logged as eating{" "}
              <b>{title}</b>.
            </p>
            <p className="text-xs text-muted">
              It includes the group invite, so new guests can join on the spot. Only show it to people at the table.
            </p>
          </div>
        </details>
      )}

      {/* Leftovers eaten at later meals */}
      {!source && !cancelled && (hasLeftovers || leftoverOptions.length > 0) && (
        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">🍲 Leftovers</h2>
          {hasLeftovers && (
            <ul className="divide-y divide-line">
              {leftoverMeals.map((m) => {
                const n = g.signups.filter(
                  (s) => s.mealId === m.id && g.memberById.get(s.memberId)?.kind !== "cook",
                ).length;
                return (
                  <li key={m.id}>
                    <Link href={`/meals/${m.id}`} className="flex items-center gap-2 py-2 text-sm">
                      <span className="flex-1 font-semibold">{shortLabel(m)}</span>
                      <span className="text-muted">{n} eating ›</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {leftoverOptions.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-accent">
                {hasLeftovers ? "+ Eaten again at another meal" : "Food left over? Mark a later meal as leftovers"}
              </summary>
              <form action={linkLeftovers} className="mt-2 flex gap-2">
                <input type="hidden" name="sourceId" value={meal.id} />
                <select name="target" className="field" aria-label="Meal with the leftovers">
                  {leftoverOptions.map((o) => (
                    <option key={`${o.date}:${o.slot}`} value={`${o.date}:${o.slot}`}>
                      {shortLabel(o)}
                      {o.existing && o.existing.status !== "cancelled" ? " (planned)" : ""}
                    </option>
                  ))}
                </select>
                <SubmitButton className="btn-ghost whitespace-nowrap">Mark</SubmitButton>
              </form>
              <p className="mt-1 text-xs text-muted">
                The groceries from this meal then get split across everyone who eats either one, per portion.
              </p>
            </details>
          )}
        </section>
      )}

      {/* Zorkasm */}
      {rateable && (
        <section className="card space-y-4 p-4">
          <h2 className="font-semibold">🔥 Zorkasm score</h2>
          <ZorkasmScore summary={zorkasm} />
          <ReviewList ratings={ratings} memberById={g.memberById} meId={me.id} />
          {!isCook && (
            <details open={!myRating} className="border-t border-line pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-accent">
                {myRating ? `Your score: ${myRating.score}/10 · edit` : "+ Rate this meal"}
              </summary>
              <div className="mt-3 space-y-2">
                <RatingForm mealId={meal.id} score={myRating?.score} review={myRating?.review} />
                {myRating && (
                  <form action={removeRating}>
                    <input type="hidden" name="mealId" value={meal.id} />
                    <SubmitButton className="w-full text-xs font-semibold text-bad">Remove my rating</SubmitButton>
                  </form>
                )}
              </div>
            </details>
          )}
        </section>
      )}

      {/* Money */}
      {!isCook && (
        <section className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Groceries</h2>
            {(!source || summary.totalCents > 0) && (
              <span className="font-display text-xl font-bold">{formatEuro(summary.totalCents)}</span>
            )}
          </div>
          {source && sourceSummary && (
            <p className="rounded-xl bg-bg px-3 py-2 text-sm">
              The main groceries ({formatEuro(sourceSummary.totalCents)}) are on{" "}
              <Link href={`/meals/${source.id}`} className="font-semibold underline">
                {shortLabel(source)}
              </Link>
              . Only add things bought just for this meal here.
            </p>
          )}
          {summary.unsplittable && (
            <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
              Nobody is signed up, so this can&apos;t be split yet. Add the people who ate.
            </p>
          )}
          {summary.attendees.length > 0 && summary.totalCents > 0 && (
            <p className="text-sm text-muted">
              {hasLeftovers
                ? `Split over ${summary.portionCount} portions incl. leftovers (cook eats free)`
                : `Split between ${summary.attendees.length} ${summary.attendees.length === 1 ? "person" : "people"} (cook eats free)`}
            </p>
          )}
          {hasLeftovers && summary.totalCents > 0 && <ShareList summary={summary} name={name} meId={me.id} />}
          <ul className="divide-y divide-line">
            {expenses.map((e) => (
              <li key={e.id} className={`flex items-center gap-3 py-2 ${e.voidedAt ? "opacity-50" : ""}`}>
                <span className="flex-1 text-sm">
                  <span className={`font-semibold ${e.voidedAt ? "line-through" : ""}`}>
                    {formatEuro(e.amountCents)}
                  </span>{" "}
                  paid by {name(e.payerId)}
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
          <details open={expenses.length === 0 && !source}>
            <summary className="cursor-pointer text-sm font-semibold text-accent">
              {source ? "+ Add extras bought for this meal" : "+ Add groceries receipt"}
            </summary>
            <div className="mt-3">
              <ExpenseForm mealId={meal.id} me={me} members={payers} />
            </div>
          </details>
        </section>
      )}

      {!isCook && source && sourceSummary && (
        <Payments
          title={`Payments for ${shortLabel(source)} + leftovers`}
          summary={sourceSummary}
          mealId={source.id}
          reference={reference(source)}
          me={me}
          memberById={g.memberById}
        />
      )}
      {!isCook && (
        <Payments
          title={source ? "Payments for extras" : "Payments for this meal"}
          summary={summary}
          mealId={meal.id}
          reference={reference(meal)}
          me={me}
          memberById={g.memberById}
        />
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
          <details className="rounded-xl border border-bad-soft p-3">
            <summary className="cursor-pointer text-sm font-semibold text-bad">Delete meal…</summary>
            <div className="mt-2 space-y-2 text-sm">
              <p>
                This permanently removes the meal
                {expenses.some((e) => !e.voidedAt) || ratings.length > 0 || attendees.length > 0
                  ? ", including its sign-ups, receipts and ratings. Balances will change to match."
                  : "."}{" "}
                Payments already made stay on record. To keep the history, cancel it instead.
              </p>
              <form action={deleteMeal}>
                <input type="hidden" name="mealId" value={meal.id} />
                <input type="hidden" name="confirm" value="1" />
                <SubmitButton className="btn w-full bg-bad text-white" pendingText="Deleting…">
                  Yes, delete {title}
                </SubmitButton>
              </form>
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}

/** Per-person shares when a meal's groceries also cover leftovers (some people have 2+ portions). */
function ShareList({ summary, name, meId }: { summary: MealSummary; name: (id: number) => string; meId: number }) {
  return (
    <ul className="space-y-1 rounded-xl bg-bg px-3 py-2 text-sm">
      {summary.attendees.map((id) => {
        const portions = summary.portionsByMember.get(id) ?? 1;
        return (
          <li key={id} className="flex items-center gap-2">
            <span className="flex-1">
              {name(id)}
              {id === meId && <span className="text-muted"> (me)</span>}
              {portions > 1 && <span className="ml-1 text-muted">× {portions} portions</span>}
            </span>
            <span className="font-semibold">{formatEuro(summary.shareByMember.get(id) ?? 0)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Payments({
  title,
  summary,
  mealId,
  reference,
  me,
  memberById,
}: {
  title: string;
  summary: MealSummary;
  mealId: number;
  reference: string;
  me: Member;
  memberById: Map<number, Member>;
}) {
  if (summary.debts.length === 0) return null;
  const open = summary.debts.filter((d) => d.paidCents < d.amountCents);
  const myDebts = open.filter((d) => d.fromId === me.id);
  const owedToMe = open.filter((d) => d.toId === me.id);
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {myDebts.map((d) => (
        <PayCard
          key={`${d.fromId}-${d.toId}`}
          from={me}
          to={memberById.get(d.toId)!}
          amountCents={d.amountCents - d.paidCents}
          mealId={mealId}
          reference={reference}
          viewerId={me.id}
        />
      ))}
      {owedToMe.map((d) => (
        <PayCard
          key={`${d.fromId}-${d.toId}`}
          from={memberById.get(d.fromId)!}
          to={me}
          amountCents={d.amountCents - d.paidCents}
          mealId={mealId}
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
                {memberById.get(d.fromId)?.name} → {memberById.get(d.toId)?.name}
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
        Prefer to settle everything at once? Use the{" "}
        <Link href="/balances" className="underline">
          Money
        </Link>{" "}
        tab.
      </p>
    </section>
  );
}
