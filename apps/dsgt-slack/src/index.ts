import "dotenv/config";

import { createBoltApp } from "./app";
import type { SlackEnv } from "./env";
import { loadEnv } from "./env";

async function main(): Promise<void> {
  let env: SlackEnv;
  try {
    env = loadEnv();
  } catch {
    console.warn(
      "dsgt Slack bot skipped: set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET in apps/dsgt-slack/.env to run locally (Socket Mode). Production traffic is handled by sites/mainweb at /api/webhooks/slack.",
    );
    await new Promise(() => {
      /* keep turbo `dev` from restarting this task */
    });
    return;
  }

  const app = createBoltApp(env);

  if (env.socketMode) {
    await app.start();
    app.logger.info("dsgt Slack bot is running (Socket Mode, local)");
    return;
  }

  await app.start(env.port);
  app.logger.info(
    `dsgt Slack bot is running a local HTTP receiver on port ${String(env.port)} at /slack/events. Production uses Firebase App Hosting at /api/webhooks/slack.`,
  );
}

main().catch((error: unknown) => {
  console.error("Failed to start the dsgt Slack bot.", error);
  process.exit(1);
});
