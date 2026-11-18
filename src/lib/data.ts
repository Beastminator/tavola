import "server-only";
import { asc, desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Member, Meal, Signup, Expense, Payment } from "@/db/schema";
import type { LedgerInput } from "./ledger";

export type GroupData = {
  members: Member[];
  memberById: Map<number, Member>;
  meals: Meal[];
  signups: Signup[];
  expenses: Expense[];
  payments: Payment[];
  ledger: LedgerInput;
};

// A friend group is small: loading everything per request keeps the money logic pure and simple.
export async function loadGroup(): Promise<GroupData> {
  const db = await getDb();
  const [members, meals, signups, expenses, payments] = await Promise.all([
    db.select().from(schema.members).orderBy(asc(schema.members.name)),
    db.select().from(schema.meals).orderBy(asc(schema.meals.date), desc(schema.meals.slot)),
    db.select().from(schema.signups),
    db.select().from(schema.expenses).orderBy(asc(schema.expenses.createdAt)),
    db.select().from(schema.payments).orderBy(desc(schema.payments.createdAt)),
  ]);
  return {
    members,
    memberById: new Map(members.map((m) => [m.id, m])),
    meals,
    signups,
    expenses,
    payments,
    ledger: { members, signups, expenses, payments },
  };
}

export const SLOT_ORDER = { lunch: 0, dinner: 1 } as const;

export function sortMeals(meals: Meal[], dir: 1 | -1 = 1): Meal[] {
  return [...meals].sort(
    (a, b) => dir * (a.date.localeCompare(b.date) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]),
  );
}
