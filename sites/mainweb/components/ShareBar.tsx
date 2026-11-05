import type { Share } from "@/assets/Data/demographics";

const TEAL_OPACITY = [1, 0.8, 0.62, 0.48, 0.36, 0.26, 0.18];

const tint = (rank: number) => ({
  backgroundColor: `rgb(0 168 168 / ${TEAL_OPACITY[rank] ?? 0.18})`,
});

export default function ShareBar({
  title,
  shares,
}: {
  title: string;
  shares: Share[];
}) {
  return (
    <figure>
      <figcaption className="font-mono text-xs uppercase tracking-[0.2em] text-gray-400">
        {title}
      </figcaption>
      <div className="mt-4 flex h-9 gap-0.5" aria-hidden="true">
        {shares.map((share, rank) => (
          <div
            key={share.label}
            className="h-full min-w-[3px]"
            style={{ flexGrow: share.value, flexBasis: 0, ...tint(rank) }}
          />
        ))}
      </div>
      <ul className="mt-5 divide-y divide-white/5 border-t border-white/5">
        {shares.map((share, rank) => (
          <li
            key={share.label}
            className="flex items-center gap-3 py-2.5 text-sm"
          >
            <span
              className="size-3 shrink-0 rounded-[2px]"
              style={tint(rank)}
              aria-hidden="true"
            />
            <span className="text-gray-200">{share.label}</span>
            <span className="ml-auto font-mono tabular-nums text-white">
              {share.value}%
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
