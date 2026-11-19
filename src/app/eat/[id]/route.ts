import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getCurrentMember } from "@/lib/auth";
import { joinMeal } from "@/lib/attendance";

/**
 * Target of a meal's QR code: scanning it logs "I ate here" in one go, then shows the meal.
 * Only reached by a deliberate scan/tap (never linked with <Link>, so it's not prefetched).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = req.nextUrl.clone();
  url.search = "";
  const mealId = Number(id);
  const me = await getCurrentMember();
  if (!me) {
    url.pathname = "/welcome";
    url.searchParams.set("next", `/eat/${mealId}`);
    return NextResponse.redirect(url);
  }
  const db = await getDb();
  const [meal] = Number.isInteger(mealId)
    ? await db.select().from(schema.meals).where(eq(schema.meals.id, mealId))
    : [];
  if (!meal) {
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  url.pathname = `/meals/${meal.id}`;
  if (meal.status === "cancelled") {
    url.searchParams.set("ate", "cancelled");
  } else {
    const added = await joinMeal(me, me, meal, "by scanning the QR");
    url.searchParams.set("ate", added ? "1" : "already");
    revalidatePath("/", "layout");
  }
  return NextResponse.redirect(url);
}
