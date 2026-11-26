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

describe("volunteers", () => {
  const mailto = `mailto:${event.contactEmail}`;
  const link = (rich: unknown) => JSON.stringify(rich);

  it("tells people what the work is and how to offer, and does not promise more", () => {
    const [lead, how, confirmed] = event.volunteers?.body ?? [];
    expect(lead).toContain("check-in desk");
    expect(link(how)).toContain(mailto);
    expect(link(how)).toContain("Volunteer");
    expect(confirmed).toBe("Organizers confirm volunteers before the event.");
    expect(event.volunteers?.body).toHaveLength(3);
  });

  it("answers 'How do I volunteer?' with the same email", () => {
    const faq = event.faqs.find((f) => f.q === "How do I volunteer?");
    expect(link(faq?.a)).toContain(mailto);
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
