/**
 * The eight flower tints. A hacker's food group is a flower, and the flower's
 * tint is the Discord role colour, the portal's bloom pass and the Hacklytics
 * site's garden. They live here so those places cannot drift apart. The keys
 * are the food group keys in @query/api/discord-config; a mainweb test holds
 * the two lists together.
 */
export const BLOOM_TINTS = {
  cherry_blossom: "#4C8DF6",
  sunflower: "#F5C518",
  tulip: "#2CC6B0",
  lily: "#F08A3C",
  lotus: "#E86FA6",
  daisy: "#F4F4F4",
  orchid: "#B07CE8",
  rose: "#C8143C",
} as const;

export type BloomTint = keyof typeof BLOOM_TINTS;
