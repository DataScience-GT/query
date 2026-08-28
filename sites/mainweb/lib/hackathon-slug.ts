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

/**
 * Admin dashboard used to put `encodeURIComponent(name)` in the path. A name
 * like "Hacklytics: Digital Bloom" became `Hacklytics%3A%20Digital%20Bloom`,
 * which matches neither the stored name nor the slug — and that is the
 * "Hackathon not found" screen. Undo one or two encode passes so old links
 * still resolve.
 */
export function decodeHackathonParam(value: string): string {
  let current = value;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

/**
 * Path segment for a hackathon URL. Prefer the slug; fall back to the id when
 * the name has nothing sluggable (`!!!`), so the link still opens something.
 */
export function hackathonPathSegment(name: string, id: string): string {
  return hackathonSlug(name) || id;
}

export function adminHackathonPath(name: string, id: string): string {
  return `/admin/hackathons/${hackathonPathSegment(name, id)}`;
}
