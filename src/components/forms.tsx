"use client";

import { useActionState, useRef, useEffect } from "react";
import type { Member } from "@/db/schema";
import {
  addExpense,
  addNewPersonToMeal,
  createMeals,
  createMember,
  rateMeal,
  updateMeal,
  updateProfile,
  type FormState,
} from "@/app/actions";
import { SubmitButton } from "./ui";

function Message({ state }: { state: FormState }) {
  if (state?.error) return <p className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>;
  if (state?.ok) return <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">{state.ok} ✓</p>;
  return null;
}

export function NewMemberForm({ next = "" }: { next?: string }) {
  const [state, action] = useActionState(createMember, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" className="field" placeholder="e.g. Giulia" autoComplete="given-name" required />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="kind" value="guest" className="size-4 accent-[var(--accent)]" />
        I&apos;m a guest (not a regular)
      </label>
      <Message state={state} />
      <SubmitButton className="btn-primary w-full">Join</SubmitButton>
    </form>
  );
}

export function ProfileForm({ me }: { me: Member }) {
  const [state, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">
          Name
        </label>
        <input id="name" name="name" defaultValue={me.name} className="field" required />
      </div>
      <div>
        <span className="label">I am</span>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["member", "Regular"],
              ["guest", "Guest"],
              ["cook", "The cook"],
            ] as const
          ).map(([v, l]) => (
            <label
              key={v}
              className="flex cursor-pointer items-center justify-center rounded-xl border border-line bg-card px-2 py-2 text-sm font-semibold has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent"
            >
              <input type="radio" name="kind" value={v} defaultChecked={me.kind === v} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">The cook eats free and is left out of cost splitting.</p>
      </div>
      <fieldset className="space-y-3 rounded-2xl border border-line p-3">
        <legend className="px-1 text-sm font-semibold">How people pay you back</legend>
        <div>
          <label className="label" htmlFor="rev">
            Revolut username
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted">revolut.me/</span>
            <input
              id="rev"
              name="revolutHandle"
              defaultValue={me.revolutHandle ?? ""}
              className="field"
              placeholder="yourname"
              autoCapitalize="none"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="iban">
            IBAN
          </label>
          <input
            id="iban"
            name="iban"
            defaultValue={me.iban ?? ""}
            className="field font-mono"
            placeholder="IT60 X054 2811 1010 0000 0123 456"
            autoCapitalize="characters"
          />
        </div>
        <div>
          <label className="label" htmlFor="ibanName">
            Account holder name
          </label>
          <input id="ibanName" name="ibanName" defaultValue={me.ibanName ?? ""} className="field" />
        </div>
      </fieldset>
      <Message state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}

export function ScheduleForm({
  days,
  existing,
}: {
  days: { date: string; label: string; sub: string }[];
  existing: string[]; // "date:slot" already scheduled
}) {
  const [state, action] = useActionState(createMeals, undefined);
  const taken = new Set(existing);
  const formRef = useRef<HTMLFormElement>(null);
  /** Tick every free box matching `pick` (a "date:slot" string) and untick the rest. */
  const select = (pick: (date: string, slot: string) => boolean) => {
    formRef.current?.querySelectorAll<HTMLInputElement>('input[name="pick"]:not(:disabled)').forEach((box) => {
      const [date, slot] = box.value.split(":");
      box.checked = pick(date, slot);
    });
  };
  const weekday = (date: string) => {
    const d = new Date(`${date}T12:00:00Z`).getUTCDay();
    return d !== 0 && d !== 6;
  };
  const thisWeek = new Set(days.slice(0, 7).map((d) => d.date));
  const quick: [string, (date: string, slot: string) => boolean][] = [
    ["Weekday lunches", (date, slot) => slot === "lunch" && weekday(date) && thisWeek.has(date)],
    ["Weekday dinners", (date, slot) => slot === "dinner" && weekday(date) && thisWeek.has(date)],
    ["Every meal this week", (date) => thisWeek.has(date)],
    ["Clear", () => false],
  ];
  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {quick.map(([label, fn]) => (
          <button key={label} type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => select(fn)}>
            {label}
          </button>
        ))}
      </div>
      <div className="card divide-y divide-line">
        <div className="grid grid-cols-[1fr_5rem_5rem] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span>Day</span>
          <span className="text-center">Lunch</span>
          <span className="text-center">Dinner</span>
        </div>
        {days.map((d) => (
          <div key={d.date} className="grid grid-cols-[1fr_5rem_5rem] items-center px-4 py-2">
            <span>
              <span className="font-semibold">{d.label}</span>
              <span className="ml-2 text-sm text-muted">{d.sub}</span>
            </span>
            {(["lunch", "dinner"] as const).map((slot) => {
              const key = `${d.date}:${slot}`;
              const isTaken = taken.has(key);
              return (
                <label key={slot} className="flex justify-center py-1">
                  <input
                    type="checkbox"
                    name="pick"
                    value={key}
                    disabled={isTaken}
                    defaultChecked={isTaken}
                    className="size-6 accent-[var(--accent)] disabled:opacity-40"
                    aria-label={`${d.label} ${slot}`}
                  />
                </label>
              );
            })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="ld">
            Lunch sign-up closes
          </label>
          <input id="ld" type="time" name="lunchDeadline" defaultValue="10:00" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="dd">
            Dinner sign-up closes
          </label>
          <input id="dd" type="time" name="dinnerDeadline" defaultValue="16:00" className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">
          Note (optional)
        </label>
        <input id="notes" name="notes" className="field" placeholder="e.g. pizza night 🍕" maxLength={300} />
      </div>
      <Message state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Scheduling…">
        Schedule selected
      </SubmitButton>
    </form>
  );
}

export function ExpenseForm({ mealId, me, members }: { mealId: number; me: Member; members: Member[] }) {
  const [state, action] = useActionState(addExpense, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="mealId" value={mealId} />
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <div>
          <label className="label" htmlFor="amount">
            Receipt total €
          </label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            className="field font-display text-lg"
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="payer">
            Paid by
          </label>
          <select id="payer" name="payerId" defaultValue={me.id} className="field">
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me.id ? `${m.name} (me)` : m.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <input name="note" className="field" placeholder="Note (optional): Esselunga, pasta + veg" maxLength={120} />
      <Message state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Adding…">
        Add groceries
      </SubmitButton>
    </form>
  );
}

export function RatingForm({
  mealId,
  score,
  review,
}: {
  mealId: number;
  score?: number;
  review?: string | null;
}) {
  const [state, action] = useActionState(rateMeal, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="mealId" value={mealId} />
      <fieldset>
        <legend className="label">Your Zorkasm score</legend>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <label
              key={n}
              className="flex cursor-pointer items-center justify-center rounded-xl border border-line bg-card py-2 font-display text-lg font-bold has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-ink"
            >
              <input type="radio" name="score" value={n} defaultChecked={score === n} className="sr-only" required />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
      <textarea
        name="review"
        defaultValue={review ?? ""}
        className="field min-h-20"
        placeholder="Review (optional): the carbonara was life-changing…"
        maxLength={500}
      />
      <Message state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Saving…">
        {score ? "Update rating" : "Rate it"}
      </SubmitButton>
    </form>
  );
}

export function MealEditForm({
  mealId,
  deadlineDate,
  deadlineTime,
  notes,
}: {
  mealId: number;
  deadlineDate: string;
  deadlineTime: string;
  notes: string;
}) {
  const [state, action] = useActionState(updateMeal, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="mealId" value={mealId} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="dd">
            Sign-up closes (day)
          </label>
          <input id="dd" type="date" name="deadlineDate" defaultValue={deadlineDate} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="dt">
            Time
          </label>
          <input id="dt" type="time" name="deadlineTime" defaultValue={deadlineTime} className="field" />
        </div>
      </div>
      <input name="notes" defaultValue={notes} className="field" placeholder="Note" maxLength={300} />
      <Message state={state} />
      <SubmitButton className="btn-ghost w-full" pendingText="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}

/** Add someone who has never opened the app to a meal, by name. */
export function NewPersonForm({ mealId }: { mealId: number }) {
  const [state, action] = useActionState(addNewPersonToMeal, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="mealId" value={mealId} />
      <div className="flex gap-2">
        <input name="name" className="field" placeholder="New person's name" maxLength={30} required aria-label="New person's name" />
        <SubmitButton className="btn-ghost whitespace-nowrap" pendingText="…">
          Add new
        </SubmitButton>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="guest" value="1" className="size-4 accent-[var(--accent)]" />
        Guest (not a regular)
      </label>
      <Message state={state} />
    </form>
  );
}
