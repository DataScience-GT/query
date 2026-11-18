/**
 * JSON for an inline `<script type="application/ld+json">`. Every `<` becomes
 * the six characters `<`, which JSON parses back to `<`, so event copy
 * containing `</script>` cannot close the tag early.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
