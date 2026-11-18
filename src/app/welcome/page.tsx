import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { pickExisting } from "@/app/actions";
import { NewMemberForm } from "@/components/forms";
import { Avatar } from "@/components/Avatar";
import { SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Welcome() {
  if (!(await getSession())) redirect("/locked");
  const db = await getDb();
  const members = await db.select().from(schema.members).orderBy(asc(schema.members.name));
  return (
    <main className="mx-auto min-h-dvh max-w-md space-y-6 px-4 py-10">
      <header className="text-center">
        <span className="text-5xl">🍝</span>
        <h1 className="mt-2 font-display text-3xl font-bold">Welcome to Tavola</h1>
        <p className="mt-1 text-muted">Who are you? This phone will remember.</p>
      </header>

      {members.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">I&apos;m already in</h2>
          <div className="grid grid-cols-2 gap-2">
            {members.map((m) => (
              <form key={m.id} action={pickExisting}>
                <input type="hidden" name="memberId" value={m.id} />
                <SubmitButton className="btn-ghost w-full justify-start">
                  <Avatar name={m.name} size={22} />
                  <span className="truncate">{m.name}</span>
                </SubmitButton>
              </form>
            ))}
          </div>
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted">{members.length ? "I'm new" : "Be the first"}</h2>
        <NewMemberForm />
      </section>
    </main>
  );
}
