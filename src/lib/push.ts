import "server-only";
import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** Notifications are optional: without VAPID keys the app works and simply sends nothing. */
export function pushPublicKey(): string | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  return VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT ? VAPID_PUBLIC_KEY : null;
}

let configured = false;
function configure(): boolean {
  if (!pushPublicKey()) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

const TIMEOUT_MS = 5000;
const OVERALL_MS = 8000;

/**
 * Sends a message to every subscribed phone of the given members. `messageFor` lets each person get
 * their own text. Never throws: notifications must never break the action that triggered them.
 * Returns how many phones accepted the message.
 */
export async function notify(memberIds: number[], messageFor: (memberId: number) => PushMessage): Promise<number> {
  try {
    if (!configure() || memberIds.length === 0) return 0;
    const db = await getDb();
    const subs = await db.select().from(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.memberId, memberIds));
    const sending = Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(messageFor(s.memberId)),
            { TTL: 12 * 60 * 60, timeout: TIMEOUT_MS, urgency: "normal" },
          );
          return true;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          // The phone unsubscribed or the subscription expired: forget it.
          if (code === 404 || code === 410) {
            await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
          } else {
            console.warn("[push] send failed", code ?? (err as Error).message);
          }
          throw err;
        }
      }),
    );
    // Hard cap so a slow push service can never hold up planning a meal.
    const results = await Promise.race([sending, new Promise<null>((r) => setTimeout(() => r(null), OVERALL_MS))]);
    return results ? results.filter((r) => r.status === "fulfilled").length : 0;
  } catch (err) {
    console.error("[push] failed", err);
    return 0;
  }
}
