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
  const volunteerUrl =
    "https://datasciencegt.org/hackathons/hacklytics-digital-bloom/volunteer";
  const link = (rich: unknown) => JSON.stringify(rich);

  it("tells people what the work is and how to apply, and does not promise more", () => {
    const [lead, how, confirmed, questions] = event.volunteers?.body ?? [];
    expect(lead).toContain("check-in desk");
    expect(how).toContain("Apply on the portal");
    expect(confirmed).toBe("Organizers confirm volunteers before the event.");
    expect(event.volunteers?.body).toHaveLength(4);
    // The email stays, as a question line and not the way to volunteer.
    expect(link(questions)).toContain(mailto);
    expect(link(questions)).toContain("Questions?");
    expect(link(event.volunteers?.body)).not.toContain("Volunteer” in the subject");
  });

  it("says both ways of helping exist: in person at Klaus, and as an online mentor", () => {
    const [lead] = event.volunteers?.body ?? [];
    expect(lead).toContain("Help in person at Klaus");
    expect(lead).toContain("online as a mentor answering hackers' questions");
    expect(lead).toContain("You can do both.");
  });

  it("has one button, \"Apply to volunteer\", that opens the application on the portal", () => {
    expect(event.volunteers?.cta).toEqual({
      label: "Apply to volunteer",
      href: volunteerUrl,
    });
  });

  it("answers 'How do I volunteer?' with the same application link, and keeps the email for questions", () => {
    const faq = event.faqs.find((f) => f.q === "How do I volunteer?");
    expect(link(faq?.a)).toContain(volunteerUrl);
    expect(link(faq?.a)).toContain(mailto);
    // It names each way of helping, so nobody thinks it is only the venue.
    expect(link(faq?.a)).toContain("in person at Klaus");
    expect(link(faq?.a)).toContain("online mentor");
    expect(link(faq?.a)).toContain("or both");
    expect(link(faq?.a)).not.toContain("in the subject");
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
