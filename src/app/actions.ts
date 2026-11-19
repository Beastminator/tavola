"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { Member, Meal, ActivityPayload } from "@/db/schema";
import { requireMember, setSession, getSession } from "@/lib/auth";
import { parseEuro, formatEuro } from "@/lib/money";
import { DEFAULT_DEADLINE, formatDay, romeToUtc, todayRome } from "@/lib/time";
import { isValidIban, normalizeIban } from "@/lib/epc";
import { canRate, MAX_SCORE, MIN_SCORE } from "@/lib/zorkasm";
import { isLeftoverSlot, LEFTOVER_MAX_DAYS } from "@/lib/leftovers";
import { joinMeal, safeNext } from "@/lib/attendance";

export type FormState = { error?: string; ok?: string } | undefined;

const MAX_CENTS = 100_000_00; // €100k sanity cap

function refresh() {
  revalidatePath("/", "layout");
}

async function log(actorId: number, type: string, payload: ActivityPayload) {
  const db = await getDb();
  await db.insert(schema.activity).values({ actorId, type, payload });
}

async function memberOrThrow(id: number): Promise<Member> {
  const db = await getDb();
  const [m] = await db.select().from(schema.members).where(eq(schema.members.id, id));
  if (!m) throw new Error("Unknown person");
  return m;
}

async function mealOrThrow(id: number): Promise<Meal> {
  const db = await getDb();
  const [m] = await db.select().from(schema.meals).where(eq(schema.meals.id, id));
  if (!m) throw new Error("Unknown meal");
  return m;
}

const mealLabel = (m: Meal) => `${m.slot} ${formatDay(m.date)}`;
const intId = z.coerce.number().int().positive();

// ---------- identity ----------

export async function pickExisting(formData: FormData) {
  if (!(await getSession())) redirect("/locked");
  const id = intId.parse(formData.get("memberId"));
  await memberOrThrow(id);
  await setSession(id);
  redirect(safeNext(String(formData.get("next") ?? "")) ?? "/");
}

export async function createMember(_: FormState, formData: FormData): Promise<FormState> {
  if (!(await getSession())) redirect("/locked");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const kind = formData.get("kind") === "guest" ? "guest" : "member";
  if (name.length < 2 || name.length > 30) return { error: "Name must be 2–30 characters." };
  const db = await getDb();
  const nameKey = name.toLowerCase();
  const [existing] = await db.select().from(schema.members).where(eq(schema.members.nameKey, nameKey));
  if (existing) return { error: `"${existing.name}" already exists — pick it from the list above.` };
  const [m] = await db.insert(schema.members).values({ name, nameKey, kind }).returning();
  await log(m.id, "member_joined", { text: `${name} joined${kind === "guest" ? " as a guest" : ""}` });
  await setSession(m.id);
  refresh();
  redirect(safeNext(String(formData.get("next") ?? "")) ?? "/me?welcome=1");
}

/**
 * Adds someone who isn't in the app yet (never opened the invite) and signs them up for a meal, so
 * their share is counted. Later they open the invite link and just pick their name from the list.
 */
export async function addNewPersonToMeal(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireMember();
  const meal = await mealOrThrow(intId.parse(formData.get("mealId")));
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const kind = formData.get("guest") === "1" ? "guest" : "member";
  if (name.length < 2 || name.length > 30) return { error: "Name must be 2–30 characters." };
  const db = await getDb();
  const nameKey = name.toLowerCase();
  let [person] = await db.select().from(schema.members).where(eq(schema.members.nameKey, nameKey));
  if (!person) {
    [person] = await db.insert(schema.members).values({ name, nameKey, kind }).returning();
    await log(me.id, "member_joined", { text: `${me.name} added ${name}${kind === "guest" ? " (guest)" : ""} to Tavola` });
  }
  const added = await joinMeal(me, person, meal);
  refresh();
  return added ? { ok: `Added ${person.name}` } : { error: `${person.name} is already on this meal.` };
}

export async function switchPerson() {
  await setSession(undefined);
  redirect("/welcome");
}

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireMember();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const kindRaw = String(formData.get("kind") ?? "member");
  const kind = (["member", "guest", "cook"] as const).find((k) => k === kindRaw) ?? "member";
  const revolut = String(formData.get("revolutHandle") ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/revolut\.me\//i, "");
  const ibanRaw = String(formData.get("iban") ?? "").trim();
  const ibanName = String(formData.get("ibanName") ?? "").trim();
  if (name.length < 2 || name.length > 30) return { error: "Name must be 2–30 characters." };
  if (revolut && !/^[a-zA-Z0-9._-]{2,40}$/.test(revolut)) return { error: "That Revolut handle looks wrong." };
  if (ibanRaw && !isValidIban(ibanRaw)) return { error: "That IBAN doesn't pass the checksum — double-check it." };
  if (ibanRaw && !ibanName) return { error: "Add the account holder name for the IBAN (needed for the bank QR)." };
  const db = await getDb();
  const nameKey = name.toLowerCase();
  const [clash] = await db.select().from(schema.members).where(eq(schema.members.nameKey, nameKey));
  if (clash && clash.id !== me.id) return { error: `Someone is already called "${clash.name}".` };
  await db
    .update(schema.members)
    .set({
      name,
      nameKey,
      kind,
      revolutHandle: revolut || null,
      iban: ibanRaw ? normalizeIban(ibanRaw) : null,
      ibanName: ibanName || null,
    })
    .where(eq(schema.members.id, me.id));
  if (kind !== me.kind) {
    await log(me.id, "profile_updated", { text: `${name} is now marked as ${kind}` });
  }
  if (name !== me.name) {
    await log(me.id, "profile_updated", { text: `${me.name} renamed to ${name}` });
  }
  refresh();
  return { ok: "Saved" };
}

// ---------- meals ----------

export async function createMeals(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireMember();
  const picks = formData.getAll("pick").map(String);
  const lunchTime = String(formData.get("lunchDeadline") || DEFAULT_DEADLINE.lunch);
  const dinnerTime = String(formData.get("dinnerDeadline") || DEFAULT_DEADLINE.dinner);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 300) || null;
  if (!/^\d{2}:\d{2}$/.test(lunchTime) || !/^\d{2}:\d{2}$/.test(dinnerTime)) return { error: "Bad deadline time." };
  if (picks.length === 0) return { error: "Tick at least one lunch or dinner." };
  const today = todayRome();
  const db = await getDb();
  let created = 0;
  for (const pick of picks) {
    const [date, slot] = pick.split(":");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (slot !== "lunch" && slot !== "dinner") || date < today) continue;
    let deadline = romeToUtc(date, slot === "lunch" ? lunchTime : dinnerTime);
    // Planning a same-day meal after its usual cut-off: keep sign-up open for another hour.
    if (deadline.getTime() < Date.now()) deadline = new Date(Date.now() + 60 * 60 * 1000);
    const [existing] = await db
      .select()
      .from(schema.meals)
      .where(and(eq(schema.meals.date, date), eq(schema.meals.slot, slot)));
    let meal: Meal;
    if (existing) {
      if (existing.status !== "cancelled") continue;
      [meal] = await db
        .update(schema.meals)
        .set({ status: "open", signupDeadline: deadline, notes, leftoversOfId: null }) // planned fresh
        .where(eq(schema.meals.id, existing.id))
        .returning();
    } else {
      [meal] = await db
        .insert(schema.meals)
        .values({ date, slot, signupDeadline: deadline, notes, createdBy: me.id })
        .returning();
    }
    created++;
    await log(me.id, "meal_created", { text: `${me.name} scheduled ${mealLabel(meal)}`, mealId: meal.id });
  }
  refresh();
  if (created === 0) return { error: "Those meals already exist." };
  redirect("/");
}

export async function updateMeal(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireMember();
  const meal = await mealOrThrow(intId.parse(formData.get("mealId")));
  const time = String(formData.get("deadlineTime") ?? "");
  const day = String(formData.get("deadlineDate") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 300) || null;
  if (!/^\d{2}:\d{2}$/.test(time) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Bad deadline." };
  const db = await getDb();
  await db
    .update(schema.meals)
    .set({ signupDeadline: romeToUtc(day, time), notes })
    .where(eq(schema.meals.id, meal.id));
  await log(me.id, "meal_updated", { text: `${me.name} edited ${mealLabel(meal)}`, mealId: meal.id });
  refresh();
  return { ok: "Saved" };
}

export async function setMealCancelled(formData: FormData) {
  const me = await requireMember();
  const meal = await mealOrThrow(intId.parse(formData.get("mealId")));
  const cancel = formData.get("cancel") === "1";
  const db = await getDb();
  await db
    .update(schema.meals)
    .set({ status: cancel ? "cancelled" : "open" })
    .where(eq(schema.meals.id, meal.id));
  await log(me.id, cancel ? "meal_cancelled" : "meal_reopened", {
    text: `${me.name} ${cancel ? "cancelled" : "re-opened"} ${mealLabel(meal)}`,
    mealId: meal.id,
  });
  refresh();
}

/**
 * Marks a later lunch/dinner as leftovers of `sourceId`. The source's groceries are then split per
 * portion across everyone who ate either meal. `target` is "YYYY-MM-DD:lunch|dinner"; the meal is
 * created if it isn't planned yet.
 */
export async function linkLeftovers(formData: FormData) {
  const me = await requireMember();
  let source = await mealOrThrow(intId.parse(formData.get("sourceId")));
  if (source.leftoversOfId) source = await mealOrThrow(source.leftoversOfId); // always link to the original
  const [date, slot] = String(formData.get("target") ?? "").split(":");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (slot !== "lunch" && slot !== "dinner")) throw new Error("Pick a meal");
  if (!isLeftoverSlot({ date, slot }, source)) {
    throw new Error(`Leftovers have to be within ${LEFTOVER_MAX_DAYS} days after the original meal`);
  }
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(schema.meals)
    .where(and(eq(schema.meals.date, date), eq(schema.meals.slot, slot)));
  let target: Meal;
  if (existing) {
    const [child] = await db.select().from(schema.meals).where(eq(schema.meals.leftoversOfId, existing.id)).limit(1);
    if (child) throw new Error("That meal has leftovers of its own");
    [target] = await db
      .update(schema.meals)
      .set({ leftoversOfId: source.id, status: "open" })
      .where(eq(schema.meals.id, existing.id))
      .returning();
  } else {
    let deadline = romeToUtc(date, DEFAULT_DEADLINE[slot]);
    if (deadline.getTime() < Date.now() && date >= todayRome()) deadline = new Date(Date.now() + 60 * 60 * 1000);
    [target] = await db
      .insert(schema.meals)
      .values({ date, slot, signupDeadline: deadline, leftoversOfId: source.id, createdBy: me.id })
      .returning();
  }
  await log(me.id, "leftovers_linked", {
    text: `${me.name} marked ${mealLabel(target)} as leftovers of ${mealLabel(source)}`,
    mealId: target.id,
  });
  refresh();
  redirect(`/meals/${target.id}`);
}

export async function unlinkLeftovers(formData: FormData) {
  const me = await requireMember();
  const meal = await mealOrThrow(intId.parse(formData.get("mealId")));
  if (!meal.leftoversOfId) return;
  const source = await mealOrThrow(meal.leftoversOfId);
  const db = await getDb();
  await db.update(schema.meals).set({ leftoversOfId: null }).where(eq(schema.meals.id, meal.id));
  await log(me.id, "leftovers_unlinked", {
    text: `${me.name} unmarked ${mealLabel(meal)} as leftovers of ${mealLabel(source)}`,
    mealId: meal.id,
  });
  refresh();
}

/** Join/leave a meal. Defaults to yourself; `memberId` lets anyone fix someone else's attendance. */
export async function setAttendance(formData: FormData) {
  const me = await requireMember();
  const meal = await mealOrThrow(intId.parse(formData.get("mealId")));
  const targetId = formData.get("memberId") ? intId.parse(formData.get("memberId")) : me.id;
  const target = targetId === me.id ? me : await memberOrThrow(targetId);
  const join = formData.get("join") === "1";
  const db = await getDb();
  const late = new Date() > meal.signupDeadline;
  const who = target.id === me.id ? me.name : `${me.name} ${join ? "added" : "removed"} ${target.name}`;
  if (join) {
    await joinMeal(me, target, meal);
  } else {
    const removed = await db
      .delete(schema.signups)
      .where(and(eq(schema.signups.mealId, meal.id), eq(schema.signups.memberId, target.id)))
      .returning();
    if (removed.length) {
      await log(me.id, "unsignup", {
        text: `${target.id === me.id ? `${who} left` : `${who} from`} ${mealLabel(meal)}${late ? " (late)" : ""}`,
        mealId: meal.id,
      });
    }
  }
  refresh();
}

// ---------- Zorkasm ratings ----------

export async function rateMeal(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireMember();
  const meal = await mealOrThrow(intId.parse(formData.get("mealId")));
  if (me.kind === "cook") return { error: "No rating your own cooking 😉" };
  if (!canRate(meal, todayRome())) return { error: "You can rate a meal once it has happened." };
  const parsed = z.coerce.number().int().min(MIN_SCORE).max(MAX_SCORE).safeParse(formData.get("score"));
  if (!parsed.success) return { error: `Pick a score from ${MIN_SCORE} to ${MAX_SCORE}.` };
  const score = parsed.data;
  const review = String(formData.get("review") ?? "").trim().slice(0, 500) || null;
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(schema.ratings)
    .where(and(eq(schema.ratings.mealId, meal.id), eq(schema.ratings.memberId, me.id)));
  await db
    .insert(schema.ratings)
    .values({ mealId: meal.id, memberId: me.id, score, review })
    .onConflictDoUpdate({
      target: [schema.ratings.mealId, schema.ratings.memberId],
      set: { score, review, updatedAt: new Date() },
    });
  if (!existing || existing.score !== score) {
    await log(me.id, "rating", {
      text: `${me.name} ${existing ? "changed their Zorkasm to" : "gave"} ${score}/10${existing ? "" : " Zorkasm"} for ${mealLabel(meal)}`,
      mealId: meal.id,
    });
  }
  refresh();
  return { ok: existing ? "Updated" : "Thanks for rating" };
}

export async function removeRating(formData: FormData) {
  const me = await requireMember();
  const meal = await mealOrThrow(intId.parse(formData.get("mealId")));
  const db = await getDb();
  const removed = await db
    .delete(schema.ratings)
    .where(and(eq(schema.ratings.mealId, meal.id), eq(schema.ratings.memberId, me.id)))
    .returning();
  if (removed.length) {
    await log(me.id, "rating_removed", { text: `${me.name} removed their rating for ${mealLabel(meal)}`, mealId: meal.id });
  }
  refresh();
}

// ---------- money ----------

export async function addExpense(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireMember();
  const meal = await mealOrThrow(intId.parse(formData.get("mealId")));
  const cents = parseEuro(String(formData.get("amount") ?? ""));
  if (!cents || cents <= 0 || cents > MAX_CENTS) return { error: "Enter an amount like 23.40" };
  const payer = await memberOrThrow(intId.parse(formData.get("payerId") ?? me.id));
  const note = String(formData.get("note") ?? "").trim().slice(0, 120) || null;
  const db = await getDb();
  const [e] = await db
    .insert(schema.expenses)
    .values({ mealId: meal.id, payerId: payer.id, amountCents: cents, note, createdBy: me.id })
    .returning();
  await log(me.id, "expense_added", {
    text: `${me.name} added ${formatEuro(cents)} groceries${payer.id !== me.id ? ` paid by ${payer.name}` : ""} for ${mealLabel(meal)}${note ? ` (${note})` : ""}`,
    expenseId: e.id,
    mealId: meal.id,
  });
  refresh();
  return { ok: "Added" };
}

export async function voidExpense(formData: FormData) {
  const me = await requireMember();
  const id = intId.parse(formData.get("expenseId"));
  const db = await getDb();
  const [e] = await db
    .update(schema.expenses)
    .set({ voidedAt: new Date() })
    .where(and(eq(schema.expenses.id, id), isNull(schema.expenses.voidedAt)))
    .returning();
  if (e) {
    const meal = await mealOrThrow(e.mealId);
    await log(me.id, "expense_voided", {
      text: `${me.name} removed the ${formatEuro(e.amountCents)} expense on ${mealLabel(meal)}`,
      expenseId: e.id,
      mealId: meal.id,
    });
  }
  refresh();
}

/** Trust-based: either side of a transfer can record it, and it counts immediately. */
export async function recordPayment(formData: FormData) {
  const me = await requireMember();
  const from = await memberOrThrow(intId.parse(formData.get("fromId")));
  const to = await memberOrThrow(intId.parse(formData.get("toId")));
  const cents = intId.parse(formData.get("amountCents"));
  const mealId = formData.get("mealId") ? intId.parse(formData.get("mealId")) : null;
  if (from.id === to.id || cents > MAX_CENTS) throw new Error("Invalid payment");
  if (me.id !== from.id && me.id !== to.id) throw new Error("Only the payer or the receiver can record a payment");
  const db = await getDb();
  const [p] = await db
    .insert(schema.payments)
    .values({ fromId: from.id, toId: to.id, amountCents: cents, mealId, createdBy: me.id })
    .returning();
  const meal = mealId ? await mealOrThrow(mealId) : null;
  await log(me.id, "payment", {
    text: `${from.name} paid ${to.name} ${formatEuro(cents)}${meal ? ` for ${mealLabel(meal)}` : ""}${me.id === to.id ? ` (marked by ${to.name})` : ""}`,
    paymentId: p.id,
    mealId: mealId ?? undefined,
  });
  refresh();
}

export async function voidPayment(formData: FormData) {
  const me = await requireMember();
  const id = intId.parse(formData.get("paymentId"));
  const db = await getDb();
  const [p] = await db
    .update(schema.payments)
    .set({ voidedAt: new Date() })
    .where(and(eq(schema.payments.id, id), isNull(schema.payments.voidedAt)))
    .returning();
  if (p) {
    const [from, to] = await Promise.all([memberOrThrow(p.fromId), memberOrThrow(p.toId)]);
    await log(me.id, "payment_voided", {
      text: `${me.name} undid "${from.name} paid ${to.name} ${formatEuro(p.amountCents)}"`,
      paymentId: p.id,
    });
  }
  refresh();
}
