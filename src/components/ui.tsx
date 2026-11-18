"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} {...rest}>
      {pending ? (pendingText ?? "…") : children}
    </button>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost px-3 py-1.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: ignore */
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

const TABS = [
  { href: "/", label: "Meals", icon: "🍝" },
  { href: "/schedule", label: "Plan", icon: "🗓️" },
  { href: "/balances", label: "Money", icon: "💶" },
  { href: "/activity", label: "Feed", icon: "📜" },
  { href: "/me", label: "Me", icon: "🙂" },
];

export function BottomNav({ hideMoney }: { hideMoney?: boolean }) {
  const path = usePathname();
  const tabs = hideMoney ? TABS.filter((t) => t.href !== "/balances") : TABS;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" || path.startsWith("/meals") : path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? "text-accent" : "text-muted"}`}
              >
                <span className={`text-xl leading-none ${active ? "" : "grayscale opacity-70"}`}>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
