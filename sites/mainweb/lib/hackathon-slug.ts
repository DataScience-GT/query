/**
 * The URL form of a hackathon name: "Hacklytics: Digital Bloom" becomes
 * "hacklytics-digital-bloom".
 *
 * Links used to carry the raw uuid, which put 36 characters of hex in front of
 * every applicant, and the plain name encodes to "Hacklytics%3A%20Digital%20Bloom"
 * — no better. Nothing is stored: `hackathon.getById` resolves a slug back to
 * the edition, so the old uuid and exact-name links keep working.
 *
 * The server has to normalise identically. Its copy is `toSlug` in
 * packages/api/src/routers/hackathon/crud.ts; the two must stay in step.
 */
export function hackathonSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
