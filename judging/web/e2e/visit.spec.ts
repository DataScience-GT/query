import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("a phone visit holds one offline score, then the board shows the published order", async ({
  page,
  request,
}) => {
  await page.goto("/j/demo/demo");
  await page.getByLabel("Email").fill("judge3@demo.panel");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Next table" }).click();
  const heading = page.getByRole("heading", { level: 2 });
  await expect(heading).toBeVisible();
  const table = (await heading.innerText()).match(/table (\d+)/)?.[1];
  expect(table).toBeTruthy();
  await page.getByLabel("Table number").fill(table ?? "");
  await page.getByRole("button", { name: "I'm here" }).click();
  await expect(page.getByText("Arrived.")).toBeVisible();
  for (const name of ["Creativity", "Impact", "Scope", "Clarity", "Soundness"]) {
    await page.getByRole("spinbutton", { name }).fill("6");
  }

  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Submit score" }).click();
  await expect(page.getByText("Held on this phone")).toBeVisible();
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Sent 1 score")).toBeVisible();

  const issued = await request.post("http://localhost:8787/v1/auth/magic-link", {
    data: { email: "organizer@demo.panel" },
  });
  const code = ((await issued.json()) as { code?: string }).code;
  expect(code).toBeTruthy();
  const verified = await request.post("http://localhost:8787/v1/auth/verify", {
    data: { email: "organizer@demo.panel", code, org: "demo" },
  });
  const token = ((await verified.json()) as { token?: string }).token;
  expect(token).toBeTruthy();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/o/demo/demo");
  await page.getByLabel("Organizer token").fill(token ?? "");
  await page.getByRole("button", { name: "judging_closed" }).click();
  await expect(page.getByText("judging_closed")).toBeVisible();
  await page.getByRole("button", { name: "Compute results" }).click();
  await expect(page.getByText("Results computed")).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published.")).toBeVisible();

  await page.goto("/e/demo/demo");
  await expect(page.getByRole("listitem").first()).toBeVisible();

  await page.goto("/o/demo/demo");
  await page.getByLabel("Organizer token").fill(token ?? "");
  await page.getByRole("button", { name: "judging_closed" }).click();
  await page.getByRole("button", { name: "judging_live" }).click();
  await expect(page.getByText("judging_live")).toBeVisible();
});
