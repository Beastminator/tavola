import Link from "next/link";
import type { Meal, Member } from "@/db/schema";
import type { MealSummary } from "@/lib/ledger";
import { formatEuro } from "@/lib/money";
import { countdown, formatDay, formatRome, relativeDay } from "@/lib/time";
import { setAttendance } from "@/app/actions";
import { AvatarStack } from "./Avatar";
import { ZorkasmChip } from "./Zorkasm";
import type { ZorkasmSummary } from "@/lib/zorkasm";
import { SubmitButton } from "./ui";

export function SlotBadge({ slot }: { slot: Meal["slot"] }) {
  return (
    <span className={`chip ${slot === "lunch" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent"}`}>
      {slot === "lunch" ? "☀️ Lunch" : "🌙 Dinner"}
    </span>
  );
}

export function MealCard({
  meal,
  attendees,
  me,
  summary,
  past,
  zorkasm,
}: {
  meal: Meal;
  attendees: Member[];
  me: Member;
  summary: MealSummary;
  past?: boolean;
  zorkasm?: ZorkasmSummary;
}) {
  const now = new Date();
  const locked = now >= meal.signupDeadline;
  const joined = attendees.some((a) => a.id === me.id);
  const isCook = me.kind === "cook";
  const eaters = attendees.filter((a) => a.kind !== "cook").length;
  const cancelled = meal.status === "cancelled";
  const rel = relativeDay(meal.date);
  const unpaid = summary.debts.filter((d) => d.paidCents < d.amountCents).length;
  const perHead = summary.attendees.length ? Math.round(summary.totalCents / summary.attendees.length) : 0;

  return (
    <article className={`card overflow-hidden ${cancelled ? "opacity-60" : ""}`}>
      <Link href={`/meals/${meal.id}`} className="block p-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlotBadge slot={meal.slot} />
            <h3 className="font-display text-lg font-bold">
              {rel ? `${rel} · ` : ""}
              {formatDay(meal.date)}
            </h3>
          </div>
          <span className="flex items-center gap-2">
            {zorkasm && <ZorkasmChip summary={zorkasm} />}
            <span className="text-muted">›</span>
          </span>
        </div>

        {cancelled ? (
          <p className="mt-2 text-sm font-semibold text-bad">Cancelled</p>
        ) : isCook && !past ? (
          <p className="mt-2 font-display text-3xl font-bold">
            Cook for {eaters + 1}
            <span className="ml-2 font-sans text-sm font-normal text-muted">
              {eaters} {eaters === 1 ? "person" : "people"} + you
            </span>
          </p>
        ) : (
          <div className="mt-2 flex items-center gap-3">
            <AvatarStack names={attendees.map((a) => a.name)} />
            <span className="text-sm text-muted">
              {eaters === 0 ? "Nobody yet" : `${eaters} eating`}
            </span>
          </div>
        )}

        {meal.notes && <p className="mt-2 text-sm">{meal.notes}</p>}

        {past && !cancelled && (
          <p className="mt-2 text-sm text-muted">
            {summary.totalCents === 0 ? (
              <span className="chip bg-warn-soft text-warn">No groceries added yet</span>
            ) : summary.unsplittable ? (
              <span className="chip bg-bad-soft text-bad">Nobody signed up to split</span>
            ) : (
              <>
                {formatEuro(summary.totalCents)} · ~{formatEuro(perHead)} each ·{" "}
                {unpaid === 0 ? (
                  <span className="font-semibold text-ok">all settled</span>
                ) : (
                  <span className="font-semibold text-accent">{unpaid} to pay</span>
                )}
              </>
            )}
          </p>
        )}
      </Link>

      {!past && !cancelled && !isCook && (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <span className="flex-1 text-xs text-muted">
            {locked
              ? `Closed ${formatRome(meal.signupDeadline, "HH:mm")} · late changes allowed`
              : `Closes in ${countdown(meal.signupDeadline, now)} (${formatRome(meal.signupDeadline, "EEE HH:mm")})`}
          </span>
          <form action={setAttendance}>
            <input type="hidden" name="mealId" value={meal.id} />
            <input type="hidden" name="join" value={joined ? "0" : "1"} />
            <SubmitButton className={joined ? "btn-ghost" : "btn-primary"} pendingText="…">
              {joined ? "✓ I'm in · leave" : locked ? "Join (late)" : "I'm in"}
            </SubmitButton>
          </form>
        </div>
      )}
    </article>
  );
}
