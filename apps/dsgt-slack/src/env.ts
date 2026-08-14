import { z } from "zod";

const truthy = (value: string | undefined) =>
  value === undefined || value.toLowerCase() !== "false";

const envSchema = z
  .object({
    SLACK_BOT_TOKEN: z.string().min(1),
    SLACK_SIGNING_SECRET: z.string().min(1),
    SLACK_APP_TOKEN: z.string().min(1).optional(),
    SLACK_SOCKET_MODE: z.string().optional(),
    PORT: z.coerce.number().int().positive().default(3000),
  })
  .superRefine((value, ctx) => {
    if (truthy(value.SLACK_SOCKET_MODE) && !value.SLACK_APP_TOKEN) {
      ctx.addIssue({
        code: "custom",
        path: ["SLACK_APP_TOKEN"],
        message:
          "SLACK_APP_TOKEN is required when Socket Mode is enabled (default).",
      });
    }
  });

export type SlackEnv = {
  botToken: string;
  signingSecret: string;
  appToken: string | undefined;
  socketMode: boolean;
  port: number;
};

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): SlackEnv {
  const parsed = envSchema.parse({
    SLACK_BOT_TOKEN: source.SLACK_BOT_TOKEN,
    SLACK_SIGNING_SECRET: source.SLACK_SIGNING_SECRET,
    SLACK_APP_TOKEN: source.SLACK_APP_TOKEN || undefined,
    SLACK_SOCKET_MODE: source.SLACK_SOCKET_MODE,
    PORT: source.PORT,
  });

  return {
    botToken: parsed.SLACK_BOT_TOKEN,
    signingSecret: parsed.SLACK_SIGNING_SECRET,
    appToken: parsed.SLACK_APP_TOKEN,
    socketMode: truthy(parsed.SLACK_SOCKET_MODE),
    port: parsed.PORT,
  };
}
