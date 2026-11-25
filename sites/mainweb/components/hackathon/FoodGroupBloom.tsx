import type { FoodGroup } from "@query/api/discord-config";
import { body, itemTitle, object } from "@query/ui/classes";
import {
  BLOOM_FLOWERS,
  glowFilter,
  headRows,
  spriteUri,
  spriteWidth,
} from "./bloom-flowers";

/**
 * One food group's flower as a picture. Decorative: the group's name is always
 * written next to it. `headOnly` drops the stem for a small mark beside text.
 */
export function FlowerSprite({
  groupKey,
  scale,
  headOnly = false,
  glow = false,
  className = "",
}: {
  groupKey: FoodGroup["key"];
  scale: number;
  headOnly?: boolean;
  glow?: boolean;
  className?: string;
}) {
  const flower = BLOOM_FLOWERS[groupKey];
  const { map, colors, tint } = flower;
  const rows = headOnly ? headRows(flower) : map;
  const width = spriteWidth(rows);
  return (
    <img
      src={spriteUri(rows, colors)}
      alt=""
      aria-hidden="true"
      width={width * scale}
      height={rows.length * scale}
      className={`shrink-0 [image-rendering:pixelated] ${className}`}
      style={glow ? { filter: glowFilter(tint) } : undefined}
    />
  );
}

/**
 * "Your bloom": the accepted hacker's own flower, their food group for meals
 * and the same name as their role in the Discord. Nothing without a group.
 */
export function FoodGroupBloom({
  group,
  className = "",
}: {
  group: Pick<FoodGroup, "key" | "name"> | null | undefined;
  className?: string;
}) {
  if (!group) return null;
  const { tint } = BLOOM_FLOWERS[group.key];
  return (
    <section
      aria-labelledby="bloom-heading"
      data-testid="food-group-bloom"
      className={`flex max-w-xl items-end gap-5 p-5 ${object} ${className}`}
      style={{ borderColor: `${tint}99` }}
    >
      <FlowerSprite groupKey={group.key} scale={7} glow />
      <div className="min-w-0 pb-1">
        <h2 id="bloom-heading" className={`${itemTitle} text-balance`}>
          Your bloom: {group.name}
        </h2>
        <p className={`mt-2 ${body}`}>
          Your flower for the weekend. It matches your role in the Hacklytics
          Discord.
        </p>
      </div>
    </section>
  );
}
