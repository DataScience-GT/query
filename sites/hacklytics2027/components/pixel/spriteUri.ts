import { PALETTES    } from "./sprites";
import type {Palette, PaletteName, SpriteMap} from "./sprites";

/**
 * Serialize a pixel map to an inline SVG data URI so it can be tiled with
 * `background-repeat` (used for the ground strip and vine rails).
 */
export function spriteToDataUri(map: SpriteMap, palette: PaletteName | Palette = "lime") {
  const colors = typeof palette === "string" ? PALETTES[palette] : palette;
  const w = Math.max(...map.map((r) => r.length));
  const h = map.length;

  let body = "";
  map.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !colors[ch]) {
        x++;
        continue;
      }
      let run = 1;
      while (row[x + run] === ch) run++;
      body += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${colors[ch]}"/>`;
      x += run;
    }
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
  return { uri: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, w, h };
}
