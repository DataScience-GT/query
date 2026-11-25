/**
 * One-time setup: tells Discord which Linked Roles metadata fields the
 * Hacklytics application publishes. Run once from a laptop:
 *
 *   DISCORD_CLIENT_ID=... DISCORD_BOT_TOKEN=... node tooling/scripts/src/discord-register-metadata.ts
 *
 * Both values come from the environment of whoever runs it and are never
 * committed. The token is only the application's own credential for this one
 * call; the app's bot user is never invited to the server and the website does
 * not read DISCORD_BOT_TOKEN.
 */

const clientId = process.env.DISCORD_CLIENT_ID;
const token = process.env.DISCORD_BOT_TOKEN;

if (!clientId || !token) {
  console.error("Set DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN, then run again.");
  process.exit(1);
}

// type 3 = integer_equal, type 7 = boolean_equal. `key` is what the callback
// sends (packages/api/src/services/discord/link.ts); do not rename it.
const records = [
  {
    key: "accepted",
    name: "Accepted to Hacklytics",
    description: "Accepted to the current Hacklytics",
    type: 7,
  },
  {
    key: "food_group",
    name: "Bloom",
    description: "Your Hacklytics flower (1-8)",
    type: 3,
  },
  {
    key: "ramadan",
    name: "Ramadan meals",
    description: "Opted in to the Ramadan meals role",
    type: 7,
  },
];

const res = await fetch(
  `https://discord.com/api/v10/applications/${clientId}/role-connections/metadata`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(records),
  },
);

if (!res.ok) {
  console.error(`Discord refused (${res.status}): ${await res.text()}`);
  process.exit(1);
}
console.log(`Registered ${records.length} metadata fields.`);
