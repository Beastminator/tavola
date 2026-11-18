import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Member } from "@/db/schema";
import { COOKIE, COOKIE_MAX_AGE, decodeSession, encodeSession, groupTag, type SessionData } from "./session";

export async function getSession(): Promise<SessionData | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value);
}

export async function setSession(memberId?: number) {
  const jar = await cookies();
  jar.set(COOKIE, await encodeSession({ g: await groupTag(), m: memberId }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/** Current member, or null if in the group but no name picked yet. Redirects to /locked if not in the group. */
export async function getCurrentMember(): Promise<Member | null> {
  const s = await getSession();
  if (!s) redirect("/locked");
  if (!s.m) return null;
  const db = await getDb();
  const [m] = await db.select().from(schema.members).where(eq(schema.members.id, s.m));
  return m ?? null;
}

/** For pages and server actions: must be in the group and have picked a name. */
export async function requireMember(): Promise<Member> {
  const m = await getCurrentMember();
  if (!m) redirect("/welcome");
  return m;
}
