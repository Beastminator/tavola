// Pure money logic. Balances are always derived from expenses + payments, never stored.
// Convention: positive balance = the group owes you; negative = you owe.

export type LMember = { id: number; kind: "member" | "guest" | "cook" };
/** Only needed for leftovers: a meal with `leftoversOfId` shares the source meal's groceries. */
export type LMeal = {
  id: number;
  date: string;
  slot: "lunch" | "dinner";
  status: "open" | "cancelled";
  leftoversOfId: number | null;
};
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
export type LedgerInput = {
  members: LMember[];
  signups: LSignup[];
  expenses: LExpense[];
  payments: LPayment[];
  meals?: LMeal[];
};

/** Splits `total` cents into `n` integer parts summing exactly to total; the first `total % n` parts get +1. */
export function splitAmount(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

const SLOT_ORDER = { lunch: 0, dinner: 1 } as const;

/**
 * Meals whose eaters share the groceries bought for `mealId`: the meal itself plus any
 * (non-cancelled) meals marked as its leftovers. Leftover meals never have leftovers of their own.
 */
export function costGroup(mealId: number, meals: LMeal[] = []): LMeal["id"][] {
  return [mealId, ...meals.filter((m) => m.leftoversOfId === mealId && m.status !== "cancelled").map((m) => m.id)];
}

/**
 * Paying portions for groceries bought for `mealId`: one entry per (non-cook) signup across the meal and
 * its leftovers, so someone who eats twice appears twice. Deterministic order: meal date/slot, then
 * signup time, then signup id (this decides who gets the remainder cents).
 */
export function mealPortions(mealId: number, input: LedgerInput, members?: Map<number, LMember>): number[] {
  const memberMap = members ?? new Map(input.members.map((m) => [m.id, m]));
  const mealMap = new Map((input.meals ?? []).map((m) => [m.id, m]));
  const group = costGroup(mealId, input.meals);
  const mealKey = (id: number) => {
    const m = mealMap.get(id);
    return m ? `${m.date}:${SLOT_ORDER[m.slot]}` : "";
  };
  return input.signups
    .filter((s) => group.includes(s.mealId) && memberMap.get(s.memberId)?.kind !== "cook")
    .sort(
      (a, b) =>
        mealKey(a.mealId).localeCompare(mealKey(b.mealId)) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id - b.id,
    )
    .map((s) => s.memberId);
}

/**
 * Shares of one expense: who owes how much to the payer (payer's own share included as from === to).
 * `portions` may repeat a member (they ate more than once); their parts are summed.
 */
export function expenseShares(expense: LExpense, portions: number[]): Debt[] {
  const parts = splitAmount(expense.amountCents, portions.length);
  const byMember = new Map<number, number>();
  portions.forEach((id, i) => byMember.set(id, (byMember.get(id) ?? 0) + parts[i]));
  return [...byMember].map(([id, amountCents]) => ({ fromId: id, toId: expense.payerId, amountCents }));
}

export type MealDebt = Debt & { paidCents: number };
export type MealSummary = {
  totalCents: number;
  /** Distinct paying people across the meal and its leftovers, in portion order. */
  attendees: number[];
  /** Number of paying portions the groceries are split over (≥ attendees.length with leftovers). */
  portionCount: number;
  /** Portions per person, only > 1 for people who ate the leftovers too. */
  portionsByMember: Map<number, number>;
  /** Non-self debts aggregated per (from, to) pair for this meal, with meal-tagged payments applied. */
  debts: MealDebt[];
  /** Total share per attendee (incl. what they owe themselves as a buyer). */
  shareByMember: Map<number, number>;
  /** true when there are active expenses but nobody (non-cook) ate: costs can't be split yet. */
  unsplittable: boolean;
};

export function summarizeMeal(mealId: number, input: LedgerInput): MealSummary {
  const portions = mealPortions(mealId, input);
  const portionsByMember = new Map<number, number>();
  for (const id of portions) portionsByMember.set(id, (portionsByMember.get(id) ?? 0) + 1);
  const active = input.expenses.filter((e) => e.mealId === mealId && !e.voidedAt);
  const totalCents = active.reduce((s, e) => s + e.amountCents, 0);
  const pair = new Map<string, MealDebt>();
  const shareByMember = new Map<number, number>();
  for (const e of active) {
    for (const d of expenseShares(e, portions)) {
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
    attendees: [...portionsByMember.keys()],
    portionCount: portions.length,
    portionsByMember,
    debts: [...pair.values()],
    shareByMember,
    unsplittable: active.length > 0 && portions.length === 0,
  };
}

/** Net balance per member across everything. */
export function computeBalances(input: LedgerInput): Map<number, number> {
  const memberMap = new Map(input.members.map((m) => [m.id, m]));
  const bal = new Map<number, number>(input.members.map((m) => [m.id, 0]));
  const add = (id: number, v: number) => bal.set(id, (bal.get(id) ?? 0) + v);
  const portionsByMeal = new Map<number, number[]>();
  for (const e of input.expenses) {
    if (e.voidedAt) continue;
    let att = portionsByMeal.get(e.mealId);
    if (!att) {
      att = mealPortions(e.mealId, input, memberMap);
      portionsByMeal.set(e.mealId, att);
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

/** Greedy transfers: largest debtor pays largest creditor until everyone is at zero (at most n-1 transfers). */
function greedySettle(entries: [number, number][]): Debt[] {
  const debtors = entries.filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const creditors = entries.filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
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

/** Above this many non-zero balances the exact search gets slow; fall back to greedy. */
const EXACT_LIMIT = 15;

/**
 * Fewest transfers that bring everyone to zero. The minimum is n − k, where k is the largest number of
 * disjoint groups whose balances each sum to zero; each group then settles in (size − 1) transfers.
 * Found exactly with a subset search for small groups (always the case for a friend group).
 */
export function settleUp(balances: Map<number, number>): Debt[] {
  const entries = [...balances].filter(([, v]) => v !== 0).sort((a, b) => a[0] - b[0]);
  const n = entries.length;
  if (n < 2 || n > EXACT_LIMIT) return greedySettle(entries);
  const full = (1 << n) - 1;
  const sum = new Int32Array(full + 1);
  const best = new Int8Array(full + 1); // max zero-sum groups that an ordering of `mask` can be cut into
  for (let m = 1; m <= full; m++) {
    const low = 31 - Math.clz32(m & -m);
    sum[m] = sum[m & (m - 1)] + entries[low][1];
    let b = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i) && best[m ^ (1 << i)] > b) b = best[m ^ (1 << i)];
    best[m] = b + (sum[m] === 0 ? 1 : 0);
  }
  // Rebuild an ordering backwards, then cut it wherever the running total hits zero.
  const order: number[] = [];
  for (let m = full; m; ) {
    const need = best[m] - (sum[m] === 0 ? 1 : 0);
    let pick = -1;
    for (let i = 0; i < n && pick < 0; i++) if (m & (1 << i) && best[m ^ (1 << i)] === need) pick = i;
    order.unshift(pick);
    m ^= 1 << pick;
  }
  const out: Debt[] = [];
  let group: [number, number][] = [];
  let running = 0;
  for (const i of order) {
    group.push(entries[i]);
    running += entries[i][1];
    if (running === 0) {
      out.push(...greedySettle(group));
      group = [];
    }
  }
  return out;
}
