/**
 * "Hacklytics: Digital Bloom" -> "hacklytics-digital-bloom". Nothing is stored;
 * `hackathon.getById` resolves it. Must match `toSlug` in
 * packages/api/src/routers/hackathon/crud.ts.
 */
export function hackathonSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
