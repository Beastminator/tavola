import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/attendance";
import { COOKIE, COOKIE_MAX_AGE, decodeSession, encodeSession, groupTag, isValidInvite } from "@/lib/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = req.nextUrl.clone();
  const next = safeNext(url.searchParams.get("next"));
  url.search = "";
  if (!(await isValidInvite(token))) {
    url.pathname = "/locked";
    return NextResponse.redirect(url);
  }
  // Keep an existing identity if this phone is already in the group.
  const existing = await decodeSession(req.cookies.get(COOKIE)?.value);
  if (existing?.m) {
    url.pathname = next ?? "/";
  } else {
    url.pathname = "/welcome";
    if (next) url.searchParams.set("next", next);
  }
  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE, await encodeSession({ g: await groupTag(), m: existing?.m }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
