import { BLOOM_TINTS } from "@query/core";
import type { BloomTint } from "@query/core";
import type { Palette } from "./sprites";

/**
 * The colours a flower opens in: the portal's eight flower tints, from
 * @query/core, so a hacker's flower on the portal and the garden here match.
 * The tint is the petal colour; the outline, the highlight and the day-theme
 * shades are derived from it, the way sites/mainweb/components/hackathon/
 * bloom-flowers.ts derives them. Only flowers use these. Buttons and links
 * stay the one pink.
 *
 * The site has no grey flowers, so it uses seven of the eight: the daisy's
 * white has no hue, which makes it grey as far as saturation goes, and on the
 * pale ground it can only be told from the page by a grey outline.
 */
export type Tint = Exclude<BloomTint, "daisy">;
export const TINTS = (Object.keys(BLOOM_TINTS) as BloomTint[]).filter(
  (tint): tint is Tint => tint !== "daisy",
);

type Theme = "dark" | "light";

const channels = (hex: string) =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/** `hex` moved `amount` (0 to 1) of the way to black or white. */
function shade(hex: string, to: "black" | "white", amount: number) {
  const target = to === "white" ? 255 : 0;
  const out = channels(hex).map((c) => Math.round(c + (target - c) * amount));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/* The centre of a bloom is the palest shade of its tint, so it still lights
   the middle without a white pixel to read as grey. A yellow petal would
   swallow that, so the sunflower gets a dark eye. */
const CENTRES: Partial<Record<Tint, string>> = {
  sunflower: "#5a3a1a",
};

/**
 * The pixels of an open flower in `tint`: petal outline p, petal P, highlight
 * c, centre Y and W. Night keeps the tint as it is, since it reads on the dark ground. Day deepens
 * it, as the pink did: the petal is darkened and the outline is dark enough
 * to carry the shape where the petal is pale (the daisy, the sunflower).
 */
export function headPalette(tint: Tint, theme: Theme): Palette {
  const base = BLOOM_TINTS[tint];
  const dark = theme === "dark";
  const p = shade(base, "black", dark ? 0.28 : 0.5);
  const P = dark ? base : shade(base, "black", 0.15);
  const c = shade(base, "white", dark ? 0.55 : 0.45);
  const Y = CENTRES[tint] ?? shade(base, "white", 0.8);
  return { p, P, c, Y, W: Y };
}

/** Every head palette, built once: a bed draws dozens of plants. */
export const HEADS: Record<Theme, Record<Tint, Palette>> = {
  dark: Object.fromEntries(TINTS.map((t) => [t, headPalette(t, "dark")])) as Record<Tint, Palette>,
  light: Object.fromEntries(TINTS.map((t) => [t, headPalette(t, "light")])) as Record<Tint, Palette>,
};
