import { requireMember } from "@/lib/auth";
import { loadGroup } from "@/lib/data";
import { formatDay, nextDays, relativeDay } from "@/lib/time";
import { ScheduleForm } from "@/components/forms";

export default async function SchedulePage() {
  await requireMember();
  const g = await loadGroup();
  const days = nextDays(14).map((date) => ({
    date,
    label: relativeDay(date) ?? formatDay(date, "EEE"),
    sub: formatDay(date, "d MMM"),
  }));
  const existing = g.meals.filter((m) => m.status !== "cancelled").map((m) => `${m.date}:${m.slot}`);
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-3xl font-bold">Plan meals</h1>
        <p className="text-sm text-muted">Tick the lunches and dinners happening (or use a shortcut). Greyed ones are already planned. Eating
          leftovers? Mark them from the original meal&apos;s page instead.</p>
      </header>
      <ScheduleForm days={days} existing={existing} />
    </div>
  );
}
