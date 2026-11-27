import { describe, expect, it } from "vitest";
import { backToPortal } from "./discord-route";

const hackathon = { id: "8c0e5f7a-0000-4000-8000-000000000001", name: "Hacklytics: Digital Bloom" };
const locationOf = (response: Response) => new URL(response.headers.get("location") ?? "");
const where = (home?: Parameters<typeof backToPortal>[2]) => {
  const url = locationOf(backToPortal(hackathon, { discord: "linked" }, home));
  return `${url.pathname}${url.search}`;
};

describe("backToPortal", () => {
  it("returns each role to the page its Discord card lives on", () => {
    expect(where("judge")).toBe("/judge?discord=linked");
    expect(where("scan")).toBe("/scan?discord=linked");
    expect(where("volunteer")).toMatch(/^\/hackathons\/.+\/volunteer\?discord=linked$/);
    expect(where("hackathon")).toMatch(/^\/hackathons\/[^/]+\?discord=linked$/);
  });

  it("goes to the dashboard when no edition is known", () => {
    expect(locationOf(backToPortal(null, { discord: "error" }, "volunteer")).pathname).toBe(
      "/dashboard",
    );
  });
});
