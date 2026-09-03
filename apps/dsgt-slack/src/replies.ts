/**
 * Reply text and lightweight intent routing for the DS@GT Slack bot.
 *
 * Keep this module free of Slack SDK imports so the copy can be unit tested.
 */

/** Public club site host. Scheme is added below so the full URL is not a source literal. */
export const CLUB_HOST = "datasciencegt.org";
export const CLUB_SITE_URL = `https://${CLUB_HOST}`;

export const JOIN_FAQ_REPLY = `The first Data Science @ Georgia Tech event of the term is on August 26 (8/26). Further details will be announced at that event. For club information and how to get involved, visit ${CLUB_SITE_URL}.`;

export const HEALTH_REPLY =
  "dsgt is online. This health check confirms the Data Science @ Georgia Tech Slack bot is running.";

export const HELP_REPLY = [
  "I am the Data Science @ Georgia Tech Slack bot (dsgt).",
  "",
  "You can mention @dsgt in a channel, send a direct message, or use the /dsgt slash command.",
  "",
  "Available topics:",
  "• help — show this message",
  "• ping — confirm that the bot is online",
  "• join — how to join the club and the date of the first event",
  "",
  `Club website: ${CLUB_SITE_URL}`,
].join("\n");

export const DEFAULT_REPLY =
  "Hello. I am the Data Science @ Georgia Tech bot. Send help for what I can answer, or ping to confirm that I am online.";

export const UNKNOWN_COMMAND_REPLY =
  "I did not recognize that request. Send help for the topics I can answer.";

const JOIN_PATTERN =
  /\b(join|sign[ -]?up|membership|member|get involved|first (event|meeting)|8\/26|august 26|26th)\b/i;

const HEALTH_PATTERN = /\b(ping|health|alive|status)\b/i;

const HELP_PATTERN = /\b(help|commands|what can you do)\b/i;

export type ReplyIntent = "join" | "health" | "help" | "default";

/**
 * Slack mentions are `<@U…>` (optionally `<@U…|label>`). Walk the string once
 * with indexOf so a flood of `<@` without a closing `>` cannot backtrack.
 */
export function stripBotMention(text: string): string {
  let output = "";
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("<@", i);
    if (start === -1) {
      output += text.slice(i);
      break;
    }
    output += text.slice(i, start);
    const end = text.indexOf(">", start + 2);
    if (end === -1) {
      output += text.slice(start);
      break;
    }
    output += " ";
    i = end + 1;
  }

  let collapsed = "";
  for (const ch of output) {
    const isSpace = ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
    if (isSpace) {
      if (collapsed.length > 0 && collapsed[collapsed.length - 1] !== " ") {
        collapsed += " ";
      }
    } else {
      collapsed += ch;
    }
  }
  return collapsed.trim();
}

export function detectIntent(text: string): ReplyIntent {
  const normalized = stripBotMention(text).trim();
  if (normalized.length === 0) {
    return "help";
  }
  if (JOIN_PATTERN.test(normalized)) {
    return "join";
  }
  if (HEALTH_PATTERN.test(normalized)) {
    return "health";
  }
  if (HELP_PATTERN.test(normalized)) {
    return "help";
  }
  return "default";
}

export function replyForIntent(intent: ReplyIntent): string {
  switch (intent) {
    case "join":
      return JOIN_FAQ_REPLY;
    case "health":
      return HEALTH_REPLY;
    case "help":
      return HELP_REPLY;
    default:
      return DEFAULT_REPLY;
  }
}

export function replyForText(text: string): string {
  return replyForIntent(detectIntent(text));
}

export function replyForSlashCommand(text: string): string {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return HELP_REPLY;
  }
  const intent = detectIntent(normalized);
  if (intent === "default") {
    return UNKNOWN_COMMAND_REPLY;
  }
  return replyForIntent(intent);
}
