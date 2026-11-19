import { requireMember } from "@/lib/auth";
import { switchPerson } from "@/app/actions";
import { ProfileForm } from "@/components/forms";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/ui";
import { NotificationSettings } from "@/components/Notifications";
import { pushPublicKey } from "@/lib/push";

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
      <NotificationSettings publicKey={pushPublicKey()} />
      <details className="card p-4" open={!!welcome}>
        <summary className="cursor-pointer font-semibold">How Tavola works</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            <b>Plan.</b> Anyone ticks the lunches and dinners coming up on the Plan tab.
          </li>
          <li>
            <b>Sign up.</b> Tap &quot;I&apos;m in&quot; before the deadline so the cook knows how many to cook for. Eat
            with us most days? Tick &quot;I&apos;m usually in&quot; above and you&apos;re signed up automatically. Turn
            on notifications to hear when a meal is planned.
          </li>
          <li>
            <b>Groceries.</b> Whoever buys the food adds the receipt total on the meal. It&apos;s split equally between
            everyone who ate. The cook eats free.
          </li>
          <li>
            <b>Leftovers.</b> If the food lasts for another meal, open the original meal and mark the later one as
            leftovers. The groceries are then split per portion across both meals, so eating twice means paying for
            two portions.
          </li>
          <li>
            <b>Pay back.</b> Pay per meal, or settle everything at once on the Money tab. Tap &quot;I paid&quot;
            afterwards. Mistakes can be undone from the Feed.
          </li>
          <li>
            <b>Rate.</b> Give each meal a Zorkasm score from 1 to 10 once it has happened.
          </li>
        </ol>
      </details>
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
