import { describeMoment } from "@query/event-kit/dates";
import { describe, expect, it } from "vitest";
import event from "./event.config";

describe("the application deadline in the copy", () => {
  const closes = describeMoment(event.timeZone, event.closesMs ?? 0);

  it("is the one date in registration.closes, wherever the copy names it", () => {
    expect(closes.long).toBe("January 20");
    expect(event.footer.note).toContain(closes.long);
    const apply = event.faqs.find((f) => f.q === "Where do I apply?");
    expect(JSON.stringify(apply?.a)).toContain(`by ${closes.long}.`);
  });
});

describe("the footer once applications have closed", () => {
  const closed = event.footer.closed;

  it("says so, instead of that they are open", () => {
    expect(closed?.headline).toBe("Applications are closed");
    expect(event.footer.headline).toBe("Applications are open");
  });

  it("stops asking people to apply and sends them to the schedule", () => {
    expect(closed?.cta).toEqual({ text: "See the schedule", href: "/#schedule" });
    expect(closed?.cta.href).not.toBe(event.registration.url);
    expect(JSON.stringify(closed)).not.toMatch(/apply/i);
  });
});
