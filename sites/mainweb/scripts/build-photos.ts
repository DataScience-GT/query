// Encodes each photo in assets/images/photos once, at every srcset width, into
// public/photos as AVIF plus a WebP fallback. <Photo> points the browser at
// these files.
//
// Without this, /_next/image encodes a photo on the server the first time a
// width is asked for: 1.5 to 7.5s per width on App Hosting, repeated after
// every deploy at every CDN location. Encoding at build makes each request a
// static file.
//
// Runs before `next build` and `next dev`. A file newer than its source is
// skipped, so a second run takes no time.
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { deviceSizes, imageSizes } from "../image-sizes.mjs";

const root = path.join(import.meta.dirname, "..");
const sourceDir = path.join(root, "assets/images/photos");
const outDir = path.join(root, "public/photos");

// next/image's own AVIF settings for quality={90}, which the photos used
// before: round(90 * 50 / 80), effort 3. Effort 6 saved 3% and took 8 minutes.
const avif = { quality: 56, effort: 3 };
// Only browsers without AVIF get this.
const webp = { quality: 80 };

const widths = [...imageSizes, ...deviceSizes];

// One file per core, each on one libvips thread, instead of every file
// competing for every core.
sharp.concurrency(1);

async function isFresh(file: string, sourceTime: number) {
  try {
    return (await stat(file)).mtimeMs >= sourceTime;
  } catch {
    return false;
  }
}

await mkdir(outDir, { recursive: true });

const jobs: (() => Promise<void>)[] = [];
for (const entry of await readdir(sourceDir)) {
  if (!entry.endsWith(".jpg")) continue;
  const source = path.join(sourceDir, entry);
  const sourceTime = (await stat(source)).mtimeMs;
  const name = entry.slice(0, -".jpg".length);
  let input: Promise<Buffer> | undefined;

  for (const width of widths) {
    for (const format of ["avif", "webp"] as const) {
      const file = path.join(outDir, `${name}-${width}.${format}`);
      jobs.push(async () => {
        if (await isFresh(file, sourceTime)) return;
        input ??= readFile(source);
        const resized = sharp(await input).resize(width, undefined, {
          withoutEnlargement: true,
        });
        await (
          format === "avif" ? resized.avif(avif) : resized.webp(webp)
        ).toFile(file);
      });
    }
  }
}

const total = jobs.length;
const started = performance.now();
await Promise.all(
  Array.from({ length: availableParallelism() }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) await job();
  }),
);
console.log(
  `photos: ${total} files in ${Math.round(performance.now() - started)}ms`,
);
