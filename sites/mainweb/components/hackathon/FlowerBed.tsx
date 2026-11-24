/**
 * The flower bed from hacklytics.io, still: mostly dormant grey plants with
 * a few in bloom. Pixel maps and colours match sites/hacklytics2027/
 * components/pixel/sprites.ts. Decorative, so hidden from assistive tech.
 */
const DAISY = [
  "....ppp....",
  "...pPPPp...",
  "..pPcccPp..",
  "..pPcYcPp..",
  "..pPcccPp..",
  "...pPPPp...",
  "....ppp....",
  ".....g.....",
  ".....g.....",
  "..GG.g.....",
  ".G..Gg.....",
  ".....g.GG..",
  ".....gG..G.",
  ".....g.....",
  ".....g.....",
  "....ggg....",
];
const TULIP = [
  "..p.p.p..",
  ".pPpPpPp.",
  ".pPPcPPp.",
  ".pPPcPPp.",
  "..pPcPp..",
  "...ppp...",
  "....g....",
  "....g....",
  "..GGg....",
  ".G..g....",
  "....gGG..",
  "....g..G.",
  "....g....",
  "....g....",
  "...ggg...",
];
const STEM = { g: "#2f6b3a", G: "#4c9a55" };
const BLOOM = { ...STEM, p: "#b8285a", P: "#ff4f8b", c: "#ffc2d6", Y: "#ffe9f0" };
const DORMANT = { ...STEM, p: "#3a403c", P: "#5a625c", c: "#8a938c", Y: "#c9cfc9" };

function spriteUri(map: string[], colors: Record<string, string>) {
  let rects = "";
  map.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (colors[ch]) {
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[ch]}"/>`;
      }
    }),
  );
  const w = Math.max(...map.map((r) => r.length));
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${map.length}" shape-rendering="crispEdges">${rects}</svg>`,
  )}`;
}

const BED = Array.from({ length: 14 }, (_, i) => ({
  map: i % 3 === 1 ? TULIP : DAISY,
  bloom: i % 4 === 2,
  scale: i % 2 ? 4 : 5,
}));

export function FlowerBed({ className = "mt-16" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none ${className} flex items-end justify-around overflow-x-clip border-b border-[var(--border-subtle)]`}
    >
      {BED.map((plant, i) => {
        const width = Math.max(...plant.map.map((r) => r.length)) * plant.scale;
        return (
          <img
            key={i}
            src={spriteUri(plant.map, plant.bloom ? BLOOM : DORMANT)}
            alt=""
            width={width}
            height={plant.map.length * plant.scale}
            className={`${i % 2 || i === 12 ? "hidden sm:block" : "block"} [image-rendering:pixelated]`}
            style={
              plant.bloom
                ? {
                    filter:
                      "drop-shadow(0 0 2px #ff4f8b) drop-shadow(0 0 10px rgba(255,79,139,.45))",
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

