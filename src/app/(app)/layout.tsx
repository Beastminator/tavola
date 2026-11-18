import { requireMember } from "@/lib/auth";
import { BottomNav } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  return (
    <>
      <main className="mx-auto min-h-dvh max-w-md px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-28">{children}</main>
      <BottomNav hideMoney={me.kind === "cook"} />
    </>
  );
}
