import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { loadGroup } from "@/lib/data";
import { computeBalances, settleUp } from "@/lib/ledger";
import { formatEuro } from "@/lib/money";
import { Avatar } from "@/components/Avatar";
import { PayCard } from "@/components/PayCard";
import { CopyButton } from "@/components/ui";

const KIND = { member: "Regular", guest: "Guest", cook: "The cook 👩‍🍳" } as const;

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember();
  const g = await loadGroup();
  const person = g.memberById.get(Number(id));
  if (!person) notFound();
  const isMe = person.id === me.id;

  const balances = computeBalances(g.ledger);
  const balance = balances.get(person.id) ?? 0;
  // Same transfers as the Money tab, so the two pages never disagree.
  const transfers = settleUp(balances);
  const iOwe = transfers.find((t) => t.fromId === me.id && t.toId === person.id);
  const owesMe = transfers.find((t) => t.fromId === person.id && t.toId === me.id);
  const mealsEaten = g.signups.filter((s) => s.memberId === person.id).length;

  return (
    <div className="space-y-5">
      <header>
        <Link href="/balances" className="text-sm text-muted">
          ‹ Money
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <Avatar name={person.name} size={52} />
          <div>
            <h1 className="font-display text-3xl font-bold">
              {person.name}
              {isMe && <span className="text-lg text-muted"> (me)</span>}
            </h1>
            <p className="text-sm text-muted">
              {KIND[person.kind]} · {mealsEaten} {mealsEaten === 1 ? "meal" : "meals"}
            </p>
          </div>
        </div>
      </header>

      {person.kind !== "cook" && (
        <p className="card flex items-center justify-between p-4">
          <span className="text-sm text-muted">Balance</span>
          <span className={`font-display text-xl font-bold ${balance < 0 ? "text-accent" : balance > 0 ? "text-ok" : "text-muted"}`}>
            {balance === 0 ? "settled" : `${balance > 0 ? "is owed" : "owes"} ${formatEuro(Math.abs(balance))}`}
          </span>
        </p>
      )}

      {iOwe && (
        <PayCard from={me} to={person} amountCents={iOwe.amountCents} reference="Tavola settle up" viewerId={me.id} />
      )}
      {owesMe && (
        <PayCard from={person} to={me} amountCents={owesMe.amountCents} reference="Tavola settle up" viewerId={me.id} />
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">How to pay {isMe ? "me" : person.name}</h2>
        {person.revolutHandle && (
          <a
            href={`https://revolut.me/${encodeURIComponent(person.revolutHandle)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn w-full bg-ink text-bg"
          >
            Open Revolut · @{person.revolutHandle}
          </a>
        )}
        {person.iban && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs">{person.iban}</code>
              <CopyButton value={person.iban} label="Copy IBAN" />
            </div>
            {person.ibanName && <p className="text-xs text-muted">Account holder: {person.ibanName}</p>}
          </div>
        )}
        {!person.revolutHandle && !person.iban && (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
            {isMe ? "You haven't" : `${person.name} hasn't`} added Revolut or an IBAN yet.
          </p>
        )}
        {isMe && (
          <Link href="/me" className="block text-sm font-semibold text-accent">
            Edit my payment details ›
          </Link>
        )}
      </section>
    </div>
  );
}
