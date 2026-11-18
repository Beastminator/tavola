import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, decodeSession } from "@/lib/session";

// Everything except the join link, the "locked" page and static assets requires a valid group cookie.
export async function middleware(req: NextRequest) {
  const session = await decodeSession(req.cookies.get(COOKIE)?.value);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/locked";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!join/|locked|_next/|favicon.ico|icon|apple-icon|manifest.webmanifest).*)"],
};
