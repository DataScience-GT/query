/**
 * Discord link configuration. No bot lives in the server: hackers connect
 * their account over OAuth and Discord's Linked Roles hand out the roles from
 * the metadata we publish (see docs/features/discord.md).
 */

/**
 * The food groups, in one place. `key` is what the database stores, `number`
 * is what Discord's `food_group` metadata carries (the server's role Links
 * requirement is "food_group equals <number>"), `name` is what people read.
 * Add or rename a group here; no migration is needed. Keep numbers stable once
 * the server's roles point at them.
 */
export const FOOD_GROUPS = [
  { key: "cherry_blossom", number: 1, name: "Cherry Blossom" },
  { key: "sunflower", number: 2, name: "Sunflower" },
  { key: "tulip", number: 3, name: "Tulip" },
  { key: "lily", number: 4, name: "Lily" },
  { key: "lotus", number: 5, name: "Lotus" },
  { key: "daisy", number: 6, name: "Daisy" },
  { key: "orchid", number: 7, name: "Orchid" },
  { key: "rose", number: 8, name: "Rose" },
] as const;

export type FoodGroup = (typeof FOOD_GROUPS)[number];

export const FOOD_GROUP_KEYS: readonly string[] = FOOD_GROUPS.map((g) => g.key);

export function foodGroupByKey(
  key: string | null | undefined,
): FoodGroup | null {
  return FOOD_GROUPS.find((g) => g.key === key) ?? null;
}

/** Statuses that may link: accepted, or already through the door. */
export const isDiscordEligible = (status: string | null | undefined) =>
  status === "approved" || status === "checked_in";

export type DiscordConfig = {
  clientId: string;
  clientSecret: string;
  inviteUrl: string;
};

/** Null unless every required variable is set; the feature hides itself then. */
export function discordConfig(
  env: Record<string, string | undefined> = process.env,
): DiscordConfig | null {
  const clientId = env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = env.DISCORD_CLIENT_SECRET?.trim();
  const inviteUrl = env.DISCORD_INVITE_URL?.trim();
  if (!clientId || !clientSecret || !inviteUrl) return null;
  if (!/^https:\/\//.test(inviteUrl)) return null;
  return { clientId, clientSecret, inviteUrl };
}
