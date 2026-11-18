const HUES = [12, 32, 145, 200, 265, 330, 90, 175];

export function Avatar({ name, size = 28, ring }: { name: string; size?: number; ring?: boolean }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return (
    <span
      title={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${ring ? "ring-2 ring-card" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 55% 48%)` }}
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ names, max = 6 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  return (
    <span className="flex -space-x-2">
      {shown.map((n) => (
        <Avatar key={n} name={n} size={26} ring />
      ))}
      {names.length > max && (
        <span className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-line px-1 text-[11px] font-bold text-muted ring-2 ring-card">
          +{names.length - max}
        </span>
      )}
    </span>
  );
}
