import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireMember } from "@/lib/auth";
import { loadGroup } from "@/lib/data";
import { formatRome } from "@/lib/time";
import { voidExpense, voidPayment } from "@/app/actions";
import { SubmitButton } from "@/components/ui";

const ICON: Record<string, string> = {
  member_joined: "👋",
  profile_updated: "✏️",
  meal_created: "🗓️",
  meal_updated: "✏️",
  meal_cancelled: "🚫",
  meal_reopened: "🔄",
  meal_deleted: "🗑️",
  signup: "🙋",
  unsignup: "🚶",
  expense_added: "🛒",
  expense_voided: "↩️",
  payment: "💸",
  payment_voided: "↩️",
  rating: "🔥",
  rating_removed: "↩️",
  leftovers_linked: "🍲",
  leftovers_unlinked: "↩️",
};

export default async function ActivityPage() {
  await requireMember();
  const db = await getDb();
  const [items, g] = await Promise.all([
    db.select().from(schema.activity).orderBy(desc(schema.activity.createdAt), desc(schema.activity.id)).limit(200),
    loadGroup(),
  ]);
  const expenseVoided = new Map(g.expenses.map((e) => [e.id, !!e.voidedAt]));
  const paymentVoided = new Map(g.payments.map((p) => [p.id, !!p.voidedAt]));

  return (
    <div className="space-y-4">
      <header>
        <Link href="/balances" className="text-sm text-muted">
          ‹ Money
        </Link>
        <h1 className="font-display text-3xl font-bold">Feed</h1>
        <p className="text-sm text-muted">Everything that happened, newest first. Spot a mistake? Undo it.</p>
      </header>
      <ol className="card divide-y divide-line">
        {items.length === 0 && <li className="p-4 text-sm text-muted">Nothing yet.</li>}
        {items.map((a) => {
          const p = a.payload;
          const canUndoPayment = a.type === "payment" && p.paymentId && paymentVoided.get(p.paymentId) === false;
          const canUndoExpense = a.type === "expense_added" && p.expenseId && expenseVoided.get(p.expenseId) === false;
          const undone =
            (a.type === "payment" && p.paymentId && paymentVoided.get(p.paymentId)) ||
            (a.type === "expense_added" && p.expenseId && expenseVoided.get(p.expenseId));
          return (
            <li key={a.id} className="flex gap-3 px-4 py-3">
              <span className="text-lg leading-6">{ICON[a.type] ?? "•"}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${undone ? "text-muted line-through" : ""}`}>
                  {p.mealId ? (
                    <Link href={`/meals/${p.mealId}`} className="hover:underline">
                      {p.text}
                    </Link>
                  ) : (
                    p.text
                  )}
                </p>
                <p className="text-xs text-muted">{formatRome(a.createdAt, "EEE d MMM · HH:mm")}</p>
              </div>
              {canUndoPayment && (
                <form action={voidPayment}>
                  <input type="hidden" name="paymentId" value={p.paymentId} />
                  <SubmitButton className="text-xs font-semibold text-bad">Undo</SubmitButton>
                </form>
              )}
              {canUndoExpense && (
                <form action={voidExpense}>
                  <input type="hidden" name="expenseId" value={p.expenseId} />
                  <SubmitButton className="text-xs font-semibold text-bad">Undo</SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
