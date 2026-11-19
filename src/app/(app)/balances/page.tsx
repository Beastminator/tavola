import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { loadGroup } from "@/lib/data";
import { computeBalances, settleUp } from "@/lib/ledger";
import { formatEuro } from "@/lib/money";
import { formatRome } from "@/lib/time";
import { voidPayment } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { PayCard } from "@/components/PayCard";
import { SubmitButton } from "@/components/ui";

export default async function BalancesPage() {
  const me = await requireMember();
  const g = await loadGroup();
  const balances = computeBalances(g.ledger);
  const transfers = settleUp(balances);
  const rows = g.members
    .filter((m) => m.kind !== "cook" || balances.get(m.id))
    .map((m) => ({ m, v: balances.get(m.id) ?? 0 }))
    .sort((a, b) => a.v - b.v);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
  const mine = transfers.filter((t) => t.fromId === me.id || t.toId === me.id);
  const others = transfers.filter((t) => t.fromId !== me.id && t.toId !== me.id);
  const recentPayments = g.payments.slice(0, 15);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Money</h1>
          <p className="text-sm text-muted">Everyone&apos;s running balance across all meals. Visible to the whole group.</p>
        </div>
        <Link href="/activity" className="btn-ghost shrink-0 px-3 py-1.5 text-xs">
          📜 Feed
        </Link>
      </header>

      <section className="card divide-y divide-line">
        {rows.map(({ m, v }) => (
          <Link key={m.id} href={`/people/${m.id}`} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar name={m.name} size={28} />
            <span className="w-24 truncate text-sm font-medium">
              {m.name}
              {m.id === me.id && <span className="text-muted"> (me)</span>}
            </span>
            <div className="relative h-2 flex-1 rounded-full bg-bg">
              <div
                className={`absolute top-0 h-2 rounded-full ${v < 0 ? "right-1/2 bg-accent" : "left-1/2 bg-ok"}`}
                style={{ width: `${(Math.abs(v) / maxAbs) * 50}%` }}
              />
            </div>
            <span
              className={`w-20 text-right text-sm font-semibold tabular-nums ${v < 0 ? "text-accent" : v > 0 ? "text-ok" : "text-muted"}`}
            >
              {v === 0 ? "settled" : `${v > 0 ? "+" : "−"}${formatEuro(Math.abs(v))}`}
            </span>
          </Link>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-muted">No one here yet.</p>}
      </section>
      <p className="-mt-4 text-xs text-muted">
        <span className="text-ok">+</span> = is owed money · <span className="text-accent">−</span> = owes money · tap a
        name for their Revolut / IBAN
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Settle up</h2>
        {transfers.length === 0 ? (
          <div className="card p-6 text-center text-muted">Everyone is square 🎉</div>
        ) : (
          <>
            {mine.map((t) => (
              <PayCard
                key={`${t.fromId}-${t.toId}`}
                from={g.memberById.get(t.fromId)!}
                to={g.memberById.get(t.toId)!}
                amountCents={t.amountCents}
                reference="Tavola settle up"
                viewerId={me.id}
              />
            ))}
            {others.length > 0 && (
              <div className="card divide-y divide-line">
                {others.map((t) => (
                  <div key={`${t.fromId}-${t.toId}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="flex-1">
                      {g.memberById.get(t.fromId)?.name} → {g.memberById.get(t.toId)?.name}
                    </span>
                    <span className="font-semibold">{formatEuro(t.amountCents)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted">
              Fewest transfers to get everyone to zero. Paying per meal works too — it all nets out here.
            </p>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recent payments</h2>
          <Link href="/activity" className="text-sm font-semibold text-accent">
            Full feed ›
          </Link>
        </div>
        <div className="card divide-y divide-line">
          {recentPayments.length === 0 && <p className="p-4 text-sm text-muted">No payments yet.</p>}
          {recentPayments.map((p) => (
            <div key={p.id} className={`flex items-center gap-2 px-4 py-2.5 text-sm ${p.voidedAt ? "opacity-50" : ""}`}>
              <span className="flex-1">
                <span className={p.voidedAt ? "line-through" : ""}>
                  {g.memberById.get(p.fromId)?.name} → {g.memberById.get(p.toId)?.name}{" "}
                  <span className="font-semibold">{formatEuro(p.amountCents)}</span>
                </span>
                <span className="block text-xs text-muted">{formatRome(p.createdAt, "EEE d MMM HH:mm")}</span>
              </span>
              {p.voidedAt ? (
                <span className="text-xs text-muted">undone</span>
              ) : (
                <form action={voidPayment}>
                  <input type="hidden" name="paymentId" value={p.id} />
                  <SubmitButton className="text-xs font-semibold text-bad">Undo</SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
