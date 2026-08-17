import { App } from "@slack/bolt";

import type { SlackEnv } from "./env";
import { replyForSlashCommand, replyForText } from "./replies";

function isDirectMessage(channelType: string | undefined): boolean {
  return channelType === "im";
}

export function registerListeners(app: App): void {
  app.event("app_mention", async ({ event, say }) => {
    await say({
      text: replyForText(event.text),
      thread_ts: event.thread_ts,
    });
  });

  app.message(async ({ message, say }) => {
    if (message.subtype !== undefined) {
      return;
    }
    if (!("text" in message) || typeof message.text !== "string") {
      return;
    }
    if ("bot_id" in message && message.bot_id) {
      return;
    }
    if (!isDirectMessage(message.channel_type)) {
      return;
    }

    await say(replyForText(message.text));
  });

  app.command("/dsgt", async ({ command, ack, respond }) => {
    await ack();
    await respond({
      text: replyForSlashCommand(command.text),
      response_type: "ephemeral",
    });
  });
}

export function createBoltApp(env: SlackEnv): App {
  const app = env.socketMode
    ? new App({
        token: env.botToken,
        signingSecret: env.signingSecret,
        socketMode: true,
        appToken: env.appToken,
      })
    : new App({
        token: env.botToken,
        signingSecret: env.signingSecret,
        customRoutes: [
          {
            path: "/health",
            method: ["GET"],
            handler: (_req, res) => {
              res.writeHead(200, { "Content-Type": "text/plain" });
              res.end("ok");
            },
          },
        ],
      });

  registerListeners(app);
  return app;
}
