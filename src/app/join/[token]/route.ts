import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, COOKIE_MAX_AGE, decodeSession, encodeSession, groupTag, isValidInvite } from "@/lib/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = req.nextUrl.clone();
  url.search = "";
  if (!(await isValidInvite(token))) {
    url.pathname = "/locked";
    return NextResponse.redirect(url);
  }
  // Keep an existing identity if this phone is already in the group.
  const existing = await decodeSession(req.cookies.get(COOKIE)?.value);
  url.pathname = existing?.m ? "/" : "/welcome";
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
