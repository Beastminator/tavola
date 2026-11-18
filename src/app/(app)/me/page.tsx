import { requireMember } from "@/lib/auth";
import { switchPerson } from "@/app/actions";
import { ProfileForm } from "@/components/forms";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/ui";

export default async function MePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const me = await requireMember();
  const { welcome } = await searchParams;
  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Avatar name={me.name} size={48} />
        <div>
          <h1 className="font-display text-3xl font-bold">{me.name}</h1>
          <p className="text-sm text-muted">{me.kind === "cook" ? "The cook 👩‍🍳" : me.kind === "guest" ? "Guest" : "Regular"}</p>
        </div>
      </header>
      {welcome && (
        <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">
          You&apos;re in! Add your Revolut or IBAN so people can pay you back when you buy groceries.
        </p>
      )}
      <ProfileForm me={me} />
      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">Add to home screen</h2>
        <p className="text-sm text-muted">
          iPhone: Share → &quot;Add to Home Screen&quot;. Android: ⋮ menu → &quot;Add to Home screen&quot;.
        </p>
      </section>
      <form action={switchPerson}>
        <SubmitButton className="btn-ghost w-full">Not {me.name}? Switch person</SubmitButton>
      </form>
    </div>
  );
}
