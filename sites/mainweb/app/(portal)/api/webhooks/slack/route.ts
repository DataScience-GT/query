import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleSlackWebhook } from "@query/dsgt-slack/http";

/**
 * Slack Events API, slash commands, and interactivity.
 *
 * Request URL (Event Subscriptions, Slash Commands, Interactivity):
 *   {AUTH_URL}/api/webhooks/slack
 * AUTH_URL / NEXTAUTH_URL in apphosting.yaml is the App Hosting origin
 * (club host datasciencegt.org). Do not point Slack at the static Firebase
 * Hosting site (`dsgt-website` / `sites/mainweb/out`). Signature checks use
 * SLACK_SIGNING_SECRET.
 */
export async function POST(req: NextRequest) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!botToken || !signingSecret) {
    console.error(
      "Slack webhook missing SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET.",
    );
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  return handleSlackWebhook(req, { botToken, signingSecret });
}
