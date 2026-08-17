#!/usr/bin/env node
/**
 * Files a ClickUp task from the command line.
 *
 *   CLICKUP_TOKEN=pk_… CLICKUP_LIST_ID=901… \
 *     node scripts/clickup-task.mjs "Bootcamp schedule still unset" "Room, time and Deepnote URL are null in lib/bootcamp-schedule.ts"
 *
 * A script rather than an inbound webhook route on purpose. Routing a firing
 * Prometheus alert into ClickUp needs an endpoint that creates tasks on an
 * unauthenticated POST, and that endpoint is a way for anyone who finds it to
 * fill the workspace with junk. This runs where a person or a cron already has
 * credentials, and adds no attack surface to the site.
 *
 * To wire it to alerts anyway: run Alertmanager with a webhook receiver that
 * pipes its JSON to `--stdin` below.
 *
 * Env:
 *   CLICKUP_TOKEN     personal API token (Settings → Apps in ClickUp)
 *   CLICKUP_LIST_ID   the list tasks land in (the number in the list URL)
 */

const token = process.env.CLICKUP_TOKEN;
const listId = process.env.CLICKUP_LIST_ID;

if (!token || !listId) {
  console.error(
    "CLICKUP_TOKEN and CLICKUP_LIST_ID must both be set. Token: ClickUp → Settings → Apps. List id: the number at the end of the list URL.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const useStdin = args[0] === "--stdin";

/** Reads an Alertmanager webhook payload and turns each alert into a task. */
async function tasksFromStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));

  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [payload];
  return alerts.map((alert) => ({
    name: alert.annotations?.summary ?? alert.labels?.alertname ?? "Alert",
    description: [
      alert.annotations?.description ?? "",
      "",
      `Labels: ${JSON.stringify(alert.labels ?? {})}`,
      alert.generatorURL ? `Source: ${alert.generatorURL}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    // Anything Prometheus pages on is worth doing today.
    priority: alert.labels?.severity === "page" ? 1 : 3,
  }));
}

const tasks = useStdin
  ? await tasksFromStdin()
  : [{ name: args[0], description: args[1] ?? "", priority: 3 }];

if (!tasks.length || !tasks[0].name) {
  console.error('Nothing to file. Usage: node scripts/clickup-task.mjs "title" ["description"]');
  process.exit(1);
}

let failures = 0;

for (const task of tasks) {
  const res = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task`,
    {
      method: "POST",
      headers: { Authorization: token, "content-type": "application/json" },
      body: JSON.stringify(task),
    },
  );

  if (!res.ok) {
    failures += 1;
    // The body carries ClickUp's own error code, which is the only thing that
    // distinguishes a bad token from a list the token cannot see.
    console.error(`Failed (${res.status}): ${await res.text()}`);
    continue;
  }

  const created = await res.json();
  console.log(`Created ${created.id}: ${created.url ?? task.name}`);
}

if (failures) process.exitCode = 1;
