import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as { subject: string; html: string; text: string }[]);

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (message: { subject: string; html: string; text: string }) => {
        sent.push(message);
      },
    }),
  },
}));

const { sendAcceptanceEmail, sendApplicationReminderEmail } = await import("./email");

describe("sendAcceptanceEmail", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("sends a Hacklytics edition in the Hacklytics look", async () => {
    await sendAcceptanceEmail({
      email: "ada@example.com",
      hackathonName: "Hacklytics: Digital Bloom",
      host: "https://datasciencegt.org",
    });

    const [message] = sent;
    expect(message?.subject).toBe("You're accepted to Hacklytics: Digital Bloom!");
    expect(message?.html).toContain("https://hacklytics.io/email/hacklytics-wordmark.png");
    expect(message?.html).toContain("#ffbfcf");
    expect(message?.html).not.toContain("DataScience<span");
    // Same content and link as before.
    expect(message?.html).toContain("Go to Hackathon Hub");
    expect(message?.html).toContain('href="https://datasciencegt.org/hackathons"');
    expect(message?.text).toContain("Go to Hackathon Hub: https://datasciencegt.org/hackathons");
  });

  it("keeps the DS@GT look for any other hackathon", async () => {
    await sendAcceptanceEmail({
      email: "ada@example.com",
      hackathonName: "Spring Build Jam",
      host: "https://datasciencegt.org",
    });

    const [message] = sent;
    expect(message?.html).toContain("DataScience<span");
    expect(message?.html).not.toContain("hacklytics-wordmark.png");
  });

  it("escapes the hackathon name in the Hacklytics look", async () => {
    await sendAcceptanceEmail({
      email: "ada@example.com",
      hackathonName: "Hacklytics <b>2027</b>",
    });

    expect(sent[0]?.html).toContain("Hacklytics &lt;b&gt;2027&lt;/b&gt;");
    expect(sent[0]?.html).not.toContain("<b>2027</b>");
  });
});

describe("sendApplicationReminderEmail", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  const hackathonUrl = "https://datasciencegt.org/hackathons/abc";

  it("asks a Hacklytics applicant to finish, with the deadline and a way out", async () => {
    await sendApplicationReminderEmail({
      email: "ada@example.com",
      hackathonName: "Hacklytics: Digital Bloom",
      hackathonUrl,
      // Late evening in Atlanta is already the next day in UTC.
      deadline: new Date("2027-01-16T03:30:00Z"),
    });

    const [message] = sent;
    expect(message?.subject).toBe("Finish your Hacklytics application");
    expect(message?.text).toContain(
      "You started your Hacklytics: Digital Bloom application but haven't sent it yet.",
    );
    expect(message?.text).toContain("Your answers are saved");
    expect(message?.text).toContain("Applications close January 15.");
    expect(message?.text).toContain("ignore this email");
    expect(message?.text).toContain("Hacklytics team");
    // Calm copy: no exclamation marks, none of the stock phrases.
    expect(message?.text).not.toMatch(/!|journey|unlock|seamless/i);
    expect(message?.text).toContain(`Finish your application: ${hackathonUrl}`);
    expect(message?.html).toContain(`href="${hackathonUrl}"`);
    expect(message?.html).toContain("hacklytics-wordmark.png");
  });

  it("leaves the deadline out when the edition has none", async () => {
    await sendApplicationReminderEmail({
      email: "ada@example.com",
      hackathonName: "Hacklytics: Digital Bloom",
      hackathonUrl,
      deadline: null,
    });

    expect(sent[0]?.text).not.toContain("Applications close");
  });

  it("names another hackathon and keeps the DS@GT look", async () => {
    await sendApplicationReminderEmail({
      email: "ada@example.com",
      hackathonName: "Spring Build Jam",
      hackathonUrl,
    });

    expect(sent[0]?.subject).toBe("Finish your Spring Build Jam application");
    expect(sent[0]?.text).toContain("DS@GT");
    expect(sent[0]?.html).toContain("DataScience<span");
    expect(sent[0]?.html).not.toContain("hacklytics-wordmark.png");
  });
});
