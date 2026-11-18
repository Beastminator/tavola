import type { Member, Rating } from "@/db/schema";
import { formatScore, zorkasmLabel, type ZorkasmSummary } from "@/lib/zorkasm";
import { Avatar } from "./Avatar";

/** Compact chip: "🔥 8.7 Zorkasm". */
export function ZorkasmChip({ summary }: { summary: ZorkasmSummary }) {
  if (summary.average === null) return null;
  return (
    <span className="chip bg-accent-soft text-accent">
      🔥 {formatScore(summary.average)}
      <span className="font-normal opacity-80">/10</span>
    </span>
  );
}

/** Big score block for the meal page and history highlights. */
export function ZorkasmScore({ summary, cook }: { summary: ZorkasmSummary; cook?: string }) {
  if (summary.average === null) {
    return <p className="text-sm text-muted">No ratings yet — be the first.</p>;
  }
  return (
    <div className="flex items-end gap-3">
      <p className="font-display text-5xl font-bold leading-none text-accent">
        {formatScore(summary.average)}
        <span className="text-xl text-muted">/10</span>
      </p>
      <div className="pb-0.5 text-sm">
        <p className="font-semibold">{zorkasmLabel(summary.average)}</p>
        <p className="text-muted">
          {summary.count} {summary.count === 1 ? "rating" : "ratings"}
          {cook ? ` · cooked by ${cook}` : ""}
        </p>
      </div>
    </div>
  );
}

export function ReviewList({
  ratings,
  memberById,
  meId,
}: {
  ratings: Rating[];
  memberById: Map<number, Member>;
  meId?: number;
}) {
  if (ratings.length === 0) return null;
  const sorted = [...ratings].sort((a, b) => b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime());
  return (
    <ul className="divide-y divide-line">
      {sorted.map((r) => {
        const name = memberById.get(r.memberId)?.name ?? "Someone";
        return (
          <li key={r.id} className="flex gap-3 py-2.5">
            <Avatar name={name} size={28} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold">
                  {name}
                  {r.memberId === meId && <span className="font-normal text-muted"> (me)</span>}
                </span>
                <span className="font-display font-bold text-accent">{r.score}/10</span>
              </p>
              {r.review && <p className="mt-0.5 whitespace-pre-line break-words text-sm">{r.review}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
