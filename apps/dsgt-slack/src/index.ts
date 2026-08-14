import "dotenv/config";

import { createBoltApp } from "./app";
import { loadEnv } from "./env";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = createBoltApp(env);

  if (env.socketMode) {
    await app.start();
    app.logger.info("dsgt Slack bot is running (Socket Mode)");
    return;
  }

  await app.start(env.port);
  app.logger.info(
    `dsgt Slack bot is running (HTTP Events API on port ${String(env.port)}; Request URL path is /slack/events)`,
  );
}

main().catch((error: unknown) => {
  console.error("Failed to start the dsgt Slack bot.", error);
  process.exit(1);
});
