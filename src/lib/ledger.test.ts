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
