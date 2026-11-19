"use client";

import { useEffect, useState } from "react";
import { removeSubscription, saveSubscription, sendTestNotification } from "@/app/actions";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "busy";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

function useNotifications(publicKey: string | null) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!publicKey) return setState("unsupported");
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      // iPhone only supports notifications once Tavola is added to the home screen.
      if (!supported) return setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const sub = await currentSubscription();
        if (sub) {
          // Re-link this phone to whoever is using it now (they may have switched person).
          await saveSubscription(sub.toJSON());
          setState("on");
        } else {
          setState("off");
        }
      } catch {
        setState("off");
      }
    })();
  }, [publicKey]);

  async function enable() {
    if (!publicKey) return;
    setError(null);
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      await saveSubscription(sub.toJSON());
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const sub = await currentSubscription();
      if (sub) {
        await removeSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
    } finally {
      setState("off");
    }
  }

  return { state, error, enable, disable };
}

/** Full control for the Me page: turn on/off, test, and explain iPhone/denied cases. */
export function NotificationSettings({ publicKey }: { publicKey: string | null }) {
  const { state, error, enable, disable } = useNotifications(publicKey);
  const [test, setTest] = useState<string | null>(null);
  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">🔔 Notifications</h2>
        <p className="text-sm text-muted">Get a ping on this phone whenever someone plans a meal.</p>
      </div>
      {state === "loading" && <p className="text-sm text-muted">Checking…</p>}
      {state === "unsupported" && (
        <p className="rounded-xl bg-line px-3 py-2 text-sm text-muted">This browser can&apos;t do notifications.</p>
      )}
      {state === "ios-install" && (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          On iPhone, add Tavola to your home screen first (Share → &quot;Add to Home Screen&quot;), open it from there,
          then come back here.
        </p>
      )}
      {state === "denied" && (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          Notifications are blocked for Tavola. Allow them in your phone or browser settings, then reload.
        </p>
      )}
      {(state === "off" || state === "busy") && (
        <button type="button" className="btn-primary w-full" disabled={state === "busy"} onClick={enable}>
          {state === "busy" ? "…" : "Turn on notifications"}
        </button>
      )}
      {state === "on" && (
        <div className="space-y-2">
          <p className="font-semibold text-ok">✓ On for this phone</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={async () => {
                setTest("Sending…");
                const n = await sendTestNotification();
                setTest(n > 0 ? "Sent! It should pop up in a few seconds." : "Couldn't send. Try turning it off and on.");
              }}
            >
              Send me a test
            </button>
            <button type="button" className="btn-ghost text-bad" onClick={disable}>
              Turn off
            </button>
          </div>
          {test && <p className="text-xs text-muted">{test}</p>}
        </div>
      )}
      {error && <p className="text-xs text-bad">{error}</p>}
    </section>
  );
}

/** Small nudge on the Meals tab, only while notifications are off and not dismissed. */
export function NotificationNudge({ publicKey }: { publicKey: string | null }) {
  const { state, enable } = useNotifications(publicKey);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem("tavola-notif-nudge") === "dismissed");
    } catch {
      setDismissed(false);
    }
  }, []);
  if (dismissed || (state !== "off" && state !== "busy")) return null;
  return (
    <div className="card flex items-center gap-3 p-3 pl-4 text-sm">
      <span className="flex-1">🔔 Get notified when a meal is planned?</span>
      <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={state === "busy"} onClick={enable}>
        Turn on
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        className="px-1 text-lg text-muted"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem("tavola-notif-nudge", "dismissed");
          } catch {
            /* storage blocked: just hide for now */
          }
        }}
      >
        ×
      </button>
    </div>
  );
}
