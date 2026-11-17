// A round avatar made from the person's initials. (Photo upload waits for object storage.)
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 font-semibold text-musawara-ink"
    >
      {initials}
    </span>
  );
}
