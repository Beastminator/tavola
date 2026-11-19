import { describe, it, expect } from "vitest";
import {
  splitAmount,
  summarizeMeal,
  computeBalances,
  settleUp,
  type LMember,
  type LSignup,
  type LExpense,
  type LPayment,
  type LMeal,
} from "./ledger";
import { parseEuro, formatEuro } from "./money";

const t = (n: number) => new Date(2026, 0, 1, 12, n);
const members: LMember[] = [
  { id: 1, kind: "member" },
  { id: 2, kind: "member" },
  { id: 3, kind: "guest" },
  { id: 4, kind: "cook" },
  { id: 5, kind: "member" },
];
const su = (id: number, mealId: number, memberId: number): LSignup => ({ id, mealId, memberId, createdAt: t(id) });
const exp = (id: number, mealId: number, payerId: number, amountCents: number, voided = false): LExpense => ({
  id,
  mealId,
  payerId,
  amountCents,
  voidedAt: voided ? new Date() : null,
});
const pay = (
  id: number,
  fromId: number,
  toId: number,
  amountCents: number,
  mealId: number | null = null,
  voided = false,
): LPayment => ({ id, fromId, toId, amountCents, mealId, voidedAt: voided ? new Date() : null });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("splitAmount", () => {
  it("sums exactly and gives the remainder to the first", () => {
    expect(splitAmount(2500, 3)).toEqual([834, 833, 833]);
    for (const [total, n] of [
      [1, 7],
      [100, 3],
      [99999, 13],
      [0, 4],
    ]) {
      expect(sum(splitAmount(total, n))).toBe(total);
    }
    expect(splitAmount(100, 0)).toEqual([]);
  });
});

describe("summarizeMeal", () => {
  const signups = [su(1, 10, 1), su(2, 10, 2), su(3, 10, 3), su(4, 10, 4)];

  it("excludes the cook and splits among attendees in signup order", () => {
    const s = summarizeMeal(10, { members, signups, expenses: [exp(1, 10, 1, 2500)], payments: [] });
    expect(s.attendees).toEqual([1, 2, 3]);
    expect(s.shareByMember.get(1)).toBe(834);
    expect(s.shareByMember.get(4)).toBeUndefined();
    expect(s.debts).toEqual([
      { fromId: 2, toId: 1, amountCents: 833, paidCents: 0 },
      { fromId: 3, toId: 1, amountCents: 833, paidCents: 0 },
    ]);
  });

  it("tracks meal-tagged payments, ignores voided and untagged", () => {
    const s = summarizeMeal(10, {
      members,
      signups,
      expenses: [exp(1, 10, 1, 2500)],
      payments: [pay(1, 2, 1, 833, 10), pay(2, 3, 1, 833, 10, true), pay(3, 3, 1, 833, null)],
    });
    expect(s.debts.find((d) => d.fromId === 2)!.paidCents).toBe(833);
    expect(s.debts.find((d) => d.fromId === 3)!.paidCents).toBe(0);
  });

  it("supports multiple payers", () => {
    const s = summarizeMeal(10, {
      members,
      signups,
      expenses: [exp(1, 10, 1, 900), exp(2, 10, 2, 300)],
      payments: [],
    });
    expect(s.totalCents).toBe(1200);
    expect(s.shareByMember.get(3)).toBe(400);
    expect(s.debts).toContainEqual({ fromId: 3, toId: 1, amountCents: 300, paidCents: 0 });
    expect(s.debts).toContainEqual({ fromId: 3, toId: 2, amountCents: 100, paidCents: 0 });
    expect(s.debts).toContainEqual({ fromId: 1, toId: 2, amountCents: 100, paidCents: 0 });
    expect(s.debts).toContainEqual({ fromId: 2, toId: 1, amountCents: 300, paidCents: 0 });
  });

  it("flags an expense with zero paying attendees", () => {
    const s = summarizeMeal(11, { members, signups: [su(9, 11, 4)], expenses: [exp(1, 11, 1, 1000)], payments: [] });
    expect(s.unsplittable).toBe(true);
    expect(s.debts).toEqual([]);
  });
});

describe("computeBalances + settleUp", () => {
  const signups = [su(1, 10, 1), su(2, 10, 2), su(3, 10, 3), su(4, 10, 4), su(5, 11, 2), su(6, 11, 3)];
  const base = { members, signups };

  it("credits a payer who did not attend, and balances sum to zero", () => {
    // member 5 paid for meal 11 but did not eat
    const b = computeBalances({ ...base, expenses: [exp(1, 10, 1, 2500), exp(2, 11, 5, 1001)], payments: [] });
    expect(b.get(5)).toBe(1001);
    expect(b.get(1)).toBe(2500 - 834);
    expect(b.get(4)).toBe(0); // cook
    expect(sum([...b.values()])).toBe(0);
  });

  it("ignores voided expenses and payments", () => {
    const b = computeBalances({
      ...base,
      expenses: [exp(1, 10, 1, 2500), exp(2, 10, 1, 9999, true)],
      payments: [pay(1, 2, 1, 833, 10, true)],
    });
    expect(b.get(2)).toBe(-833);
  });

  it("payments net against balances", () => {
    const b = computeBalances({ ...base, expenses: [exp(1, 10, 1, 2500)], payments: [pay(1, 2, 1, 833)] });
    expect(b.get(2)).toBe(0);
    expect(b.get(1)).toBe(833);
  });

  it("expense on a meal with no paying attendees has no effect", () => {
    const b = computeBalances({ members, signups: [su(1, 12, 4)], expenses: [exp(1, 12, 1, 5000)], payments: [] });
    expect([...b.values()].every((v) => v === 0)).toBe(true);
  });

  it("settle-up transfers zero out every balance", () => {
    const b = computeBalances({
      ...base,
      expenses: [exp(1, 10, 1, 2500), exp(2, 11, 5, 1001), exp(3, 10, 2, 777)],
      payments: [pay(1, 3, 1, 500)],
    });
    const transfers = settleUp(b);
    const after = new Map(b);
    for (const tr of transfers) {
      expect(tr.amountCents).toBeGreaterThan(0);
      after.set(tr.fromId, after.get(tr.fromId)! + tr.amountCents);
      after.set(tr.toId, after.get(tr.toId)! - tr.amountCents);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
    expect(transfers.length).toBeLessThanOrEqual([...b.values()].filter((v) => v !== 0).length - 1);
  });
});

describe("leftovers", () => {
  // Meal 20 = Mon dinner (source), 21 = Tue lunch (leftovers of 20), 22 = cancelled leftovers of 20.
  const meals: LMeal[] = [
    { id: 20, date: "2026-01-05", slot: "dinner", status: "open", leftoversOfId: null },
    { id: 21, date: "2026-01-06", slot: "lunch", status: "open", leftoversOfId: 20 },
    { id: 22, date: "2026-01-07", slot: "lunch", status: "cancelled", leftoversOfId: 20 },
  ];
  // Source: 1, 2, cook. Leftovers: 2 (again), 3, cook. Cancelled leftovers: 5.
  const signups = [su(1, 20, 1), su(2, 20, 2), su(3, 20, 4), su(4, 21, 2), su(5, 21, 3), su(6, 21, 4), su(7, 22, 5)];
  const input = (expenses: LExpense[], payments: LPayment[] = []) => ({ members, signups, meals, expenses, payments });

  it("splits the source meal's groceries per portion across both meals", () => {
    const s = summarizeMeal(20, input([exp(1, 20, 1, 4000)]));
    expect(s.portionCount).toBe(4); // 1, 2, 2, 3 — cook and cancelled meal excluded
    expect(s.attendees).toEqual([1, 2, 3]);
    expect(s.portionsByMember.get(2)).toBe(2);
    expect(s.shareByMember.get(1)).toBe(1000);
    expect(s.shareByMember.get(2)).toBe(2000); // ate twice, pays twice
    expect(s.shareByMember.get(3)).toBe(1000);
    expect(s.shareByMember.get(4)).toBeUndefined();
    expect(s.shareByMember.get(5)).toBeUndefined();
    expect(sum([...s.shareByMember.values()])).toBe(4000);
  });

  it("shares always add up exactly, remainder to the earliest portions", () => {
    const s = summarizeMeal(20, input([exp(1, 20, 1, 1001)]));
    expect(sum([...s.shareByMember.values()])).toBe(1001);
    expect(s.shareByMember.get(1)).toBe(251); // first portion gets the extra cent
  });

  it("extra groceries bought for the leftover meal only hit its own eaters", () => {
    const s = summarizeMeal(21, input([exp(1, 21, 3, 300)]));
    expect(s.attendees).toEqual([2, 3]);
    expect(s.shareByMember.get(2)).toBe(150);
    expect(s.shareByMember.get(1)).toBeUndefined();
  });

  it("is splittable when only the leftover meal has eaters", () => {
    const s = summarizeMeal(20, {
      members,
      meals,
      signups: [su(1, 21, 3)],
      expenses: [exp(1, 20, 1, 1000)],
      payments: [],
    });
    expect(s.unsplittable).toBe(false);
    expect(s.shareByMember.get(3)).toBe(1000);
  });

  it("balances match per-meal debts and sum to zero", () => {
    const expenses = [exp(1, 20, 1, 4001), exp(2, 21, 3, 300)];
    const b = computeBalances(input(expenses));
    expect(sum([...b.values()])).toBe(0);
    const s20 = summarizeMeal(20, input(expenses));
    const s21 = summarizeMeal(21, input(expenses));
    for (const m of members) {
      let fromDebts = 0;
      for (const d of [...s20.debts, ...s21.debts]) {
        if (d.toId === m.id) fromDebts += d.amountCents;
        if (d.fromId === m.id) fromDebts -= d.amountCents;
      }
      expect(b.get(m.id)).toBe(fromDebts);
    }
    expect(b.get(4)).toBe(0);
  });
});

describe("money", () => {
  it("parses euro strings", () => {
    expect(parseEuro("12")).toBe(1200);
    expect(parseEuro("12,5")).toBe(1250);
    expect(parseEuro("€ 12.05")).toBe(1205);
    expect(parseEuro("12.345")).toBeNull();
    expect(parseEuro("abc")).toBeNull();
    expect(parseEuro("-3")).toBeNull();
  });
  it("formats", () => {
    expect(formatEuro(834)).toBe("€8.34");
  });
});
