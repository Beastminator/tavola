// Pure money logic. Balances are always derived from expenses + payments, never stored.
// Convention: positive balance = the group owes you; negative = you owe.

export type LMember = { id: number; kind: "member" | "guest" | "cook" };
export type LSignup = { id: number; mealId: number; memberId: number; createdAt: Date };
export type LExpense = { id: number; mealId: number; payerId: number; amountCents: number; voidedAt: Date | null };
export type LPayment = {
  id: number;
  fromId: number;
  toId: number;
  amountCents: number;
  mealId: number | null;
  voidedAt: Date | null;
};
export type Debt = { fromId: number; toId: number; amountCents: number };
export type LedgerInput = { members: LMember[]; signups: LSignup[]; expenses: LExpense[]; payments: LPayment[] };

/** Splits `total` cents into `n` integer parts summing exactly to total; the first `total % n` parts get +1. */
export function splitAmount(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Paying attendees of a meal (cook excluded), in deterministic order: signup time, then signup id. */
export function payingAttendees(mealId: number, signups: LSignup[], members: Map<number, LMember>): number[] {
  return signups
    .filter((s) => s.mealId === mealId && members.get(s.memberId)?.kind !== "cook")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
    .map((s) => s.memberId);
}

/** Shares of one expense: who owes how much to the payer (payer's own share included as from === to). */
export function expenseShares(expense: LExpense, attendees: number[]): Debt[] {
  const parts = splitAmount(expense.amountCents, attendees.length);
  return attendees.map((id, i) => ({ fromId: id, toId: expense.payerId, amountCents: parts[i] }));
}

export type MealDebt = Debt & { paidCents: number };
export type MealSummary = {
  totalCents: number;
  attendees: number[];
  /** Non-self debts aggregated per (from, to) pair for this meal, with meal-tagged payments applied. */
  debts: MealDebt[];
  /** Total share per attendee (incl. what they owe themselves as a buyer). */
  shareByMember: Map<number, number>;
  /** true when there are active expenses but nobody (non-cook) attended: costs can't be split yet. */
  unsplittable: boolean;
};

export function summarizeMeal(mealId: number, input: LedgerInput): MealSummary {
  const memberMap = new Map(input.members.map((m) => [m.id, m]));
  const attendees = payingAttendees(mealId, input.signups, memberMap);
  const active = input.expenses.filter((e) => e.mealId === mealId && !e.voidedAt);
  const totalCents = active.reduce((s, e) => s + e.amountCents, 0);
  const pair = new Map<string, MealDebt>();
  const shareByMember = new Map<number, number>();
  for (const e of active) {
    for (const d of expenseShares(e, attendees)) {
      shareByMember.set(d.fromId, (shareByMember.get(d.fromId) ?? 0) + d.amountCents);
      if (d.fromId === d.toId) continue;
      const k = `${d.fromId}:${d.toId}`;
      const cur = pair.get(k) ?? { fromId: d.fromId, toId: d.toId, amountCents: 0, paidCents: 0 };
      cur.amountCents += d.amountCents;
      pair.set(k, cur);
    }
  }
  for (const p of input.payments) {
    if (p.voidedAt || p.mealId !== mealId) continue;
    const cur = pair.get(`${p.fromId}:${p.toId}`);
    if (cur) cur.paidCents += p.amountCents;
  }
  return {
    totalCents,
    attendees,
    debts: [...pair.values()],
    shareByMember,
    unsplittable: active.length > 0 && attendees.length === 0,
  };
}

/** Net balance per member across everything. */
export function computeBalances(input: LedgerInput): Map<number, number> {
  const memberMap = new Map(input.members.map((m) => [m.id, m]));
  const bal = new Map<number, number>(input.members.map((m) => [m.id, 0]));
  const add = (id: number, v: number) => bal.set(id, (bal.get(id) ?? 0) + v);
  const attendeesByMeal = new Map<number, number[]>();
  for (const e of input.expenses) {
    if (e.voidedAt) continue;
    let att = attendeesByMeal.get(e.mealId);
    if (!att) {
      att = payingAttendees(e.mealId, input.signups, memberMap);
      attendeesByMeal.set(e.mealId, att);
    }
    if (att.length === 0) continue; // unsplittable: no effect until someone is added
    add(e.payerId, e.amountCents);
    for (const d of expenseShares(e, att)) add(d.fromId, -d.amountCents);
  }
  for (const p of input.payments) {
    if (p.voidedAt) continue;
    add(p.fromId, p.amountCents);
    add(p.toId, -p.amountCents);
  }
  return bal;
}

/** Greedy transfers: largest debtor pays largest creditor until everyone is at zero. */
export function settleUp(balances: Map<number, number>): Debt[] {
  const debtors = [...balances].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const creditors = [...balances].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const out: Debt[] = [];
  const byDesc = (a: { v: number; id: number }, b: { v: number; id: number }) => b.v - a.v || a.id - b.id;
  while (debtors.length && creditors.length) {
    debtors.sort(byDesc);
    creditors.sort(byDesc);
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.v, c.v);
    out.push({ fromId: d.id, toId: c.id, amountCents: amt });
    d.v -= amt;
    c.v -= amt;
    if (d.v === 0) debtors.shift();
    if (c.v === 0) creditors.shift();
  }
  return out;
}
