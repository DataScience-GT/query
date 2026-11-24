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

const { sendAcceptanceEmail } = await import("./email");

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
