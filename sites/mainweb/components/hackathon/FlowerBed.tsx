import type { FoodGroup } from "@query/api/discord-config";
import { BLOOM_FLOWERS, spriteUri } from "./bloom-flowers";

/**
 * The flower bed from hacklytics.io, still: mostly dormant grey plants with
 * a few in bloom. Pixel maps and colours match sites/hacklytics2027/
 * components/pixel/sprites.ts. Decorative, so hidden from assistive tech.
 * A hacker with a food group has their own flower in bloom in the middle.
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

const BED = Array.from({ length: 14 }, (_, i) => ({
  map: i % 3 === 1 ? TULIP : DAISY,
  bloom: i % 4 === 2,
  scale: i % 2 ? 4 : 5,
}));

// The slot, among the blooming ones, that holds the hacker's own flower.
const MINE = 6;

export function FlowerBed({
  className = "mt-16",
  foodGroup,
}: {
  className?: string;
  foodGroup?: FoodGroup["key"] | null;
}) {
  const mine = foodGroup ? BLOOM_FLOWERS[foodGroup] : null;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none ${className} flex items-end justify-around overflow-x-clip border-b border-[var(--border-subtle)]`}
    >
      {BED.map((plant, i) => {
        const own = i === MINE ? mine : null;
        const map = own?.map ?? plant.map;
        const glow = own?.tint ?? (plant.bloom ? "#ff4f8b" : null);
        const width = Math.max(...map.map((r) => r.length)) * plant.scale;
        return (
          <img
            key={i}
            src={spriteUri(map, own?.colors ?? (plant.bloom ? BLOOM : DORMANT))}
            alt=""
            width={width}
            height={map.length * plant.scale}
            className={`${i % 2 || i === 12 ? "hidden sm:block" : "block"} [image-rendering:pixelated]`}
            style={
              glow
                ? {
                    filter: `drop-shadow(0 0 2px ${glow}) drop-shadow(0 0 10px ${glow}73)`,
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
