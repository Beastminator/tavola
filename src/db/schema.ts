import {
  pgTable, serial, text, integer, timestamp, date, jsonb, boolean, uniqueIndex, index, type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(), // lowercased, for case-insensitive uniqueness
    kind: text("kind", { enum: ["member", "guest", "cook"] }).notNull().default("member"),
    revolutHandle: text("revolut_handle"),
    iban: text("iban"),
    ibanName: text("iban_name"),
    /** Signed up automatically for every newly planned meal; they tap "Can't make it" to opt out. */
    usuallyIn: boolean("usually_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("members_name_key_idx").on(t.nameKey)],
);

export const meals = pgTable(
  "meals",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(), // YYYY-MM-DD, Europe/Rome local date
    slot: text("slot", { enum: ["lunch", "dinner"] }).notNull(),
    signupDeadline: timestamp("signup_deadline", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["open", "cancelled"] }).notNull().default("open"),
    notes: text("notes"),
    /** Set when this meal is (mostly) leftovers of an earlier one: that meal's groceries get split across both. */
    leftoversOfId: integer("leftovers_of_id").references((): AnyPgColumn => meals.id),
    createdBy: integer("created_by").references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("meals_date_slot_idx").on(t.date, t.slot)],
);

export const signups = pgTable(
  "signups",
  {
    id: serial("id").primaryKey(),
    mealId: integer("meal_id").notNull().references(() => meals.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("signups_meal_member_idx").on(t.mealId, t.memberId)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    mealId: integer("meal_id").notNull().references(() => meals.id),
    payerId: integer("payer_id").notNull().references(() => members.id),
    amountCents: integer("amount_cents").notNull(),
    note: text("note"),
    createdBy: integer("created_by").references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
  },
  (t) => [index("expenses_meal_idx").on(t.mealId)],
);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  fromId: integer("from_id").notNull().references(() => members.id),
  toId: integer("to_id").notNull().references(() => members.id),
  amountCents: integer("amount_cents").notNull(),
  mealId: integer("meal_id").references(() => meals.id),
  createdBy: integer("created_by").references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
});

/** Zorkasm score: one rating (1–10) + optional review per person per meal. */
export const ratings = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    mealId: integer("meal_id").notNull().references(() => meals.id),
    memberId: integer("member_id").notNull().references(() => members.id),
    score: integer("score").notNull(),
    review: text("review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ratings_meal_member_idx").on(t.mealId, t.memberId)],
);

/** Web Push subscriptions: one row per phone/browser that turned notifications on. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id").notNull().references(() => members.id),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint)],
);

export type ActivityPayload = {
  text: string;
  expenseId?: number;
  paymentId?: number;
  mealId?: number;
};

export const activity = pgTable("activity", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => members.id),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<ActivityPayload>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Member = typeof members.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type Signup = typeof signups.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Activity = typeof activity.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
