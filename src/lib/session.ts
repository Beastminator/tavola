// Signed session cookie, Web Crypto only so it works in both middleware (edge) and Node.
// Cookie payload: { g: groupTag, m?: memberId }. groupTag is derived from GROUP_INVITE_TOKEN,
// so rotating the invite token logs everyone out.

export const COOKIE = "tavola";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // ~400 days (browser max)

export type SessionData = { g: string; m?: number };

const enc = new TextEncoder();

function inviteToken(): string {
  const t = process.env.GROUP_INVITE_TOKEN;
  if (t) return t;
  if (process.env.NODE_ENV === "production") throw new Error("GROUP_INVITE_TOKEN is not set");
  return "dev";
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
  return "dev-secret-change-me";
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export async function groupTag(): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`tavola-group:${inviteToken()}`));
  return b64url(new Uint8Array(digest)).slice(0, 16);
}

/** Constant-time-ish string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function isValidInvite(token: string): Promise<boolean> {
  return safeEqual(token, inviteToken());
}

export async function encodeSession(data: SessionData): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(data)));
  return `${body}.${await hmac(body)}`;
}

/** Returns the session only if the signature is valid and it belongs to the current group. */
export async function decodeSession(value: string | undefined): Promise<SessionData | null> {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, await hmac(body))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionData;
    if (data.g !== (await groupTag())) return null;
    return data;
  } catch {
    return null;
  }
}
