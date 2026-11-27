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

const {
  sendAcceptanceEmail,
  sendApplicationReminderEmail,
  sendJudgeAddedEmail,
  sendJudgeApprovedEmail,
  sendVolunteerApprovedEmail,
  sendVolunteerDeclinedEmail,
} = await import("./email");

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

describe("Discord in the acceptance and judge emails", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("asks an accepted hacker to confirm before joining the Discord", async () => {
    await sendAcceptanceEmail({
      email: "ada@example.com",
      hackathonName: "Hacklytics: Digital Bloom",
      host: "https://datasciencegt.org",
    });
    expect(sent[0]?.text).toContain(
      "Confirm you're coming in the Hackathon Hub, then join the Hacklytics Discord to get your flower role.",
    );
  });

  it("tells an approved or added judge the Discord is required, and points to the portal step", async () => {
    await sendJudgeApprovedEmail({
      email: "judge@example.com",
      hackathonName: "Hacklytics: Digital Bloom",
      host: "https://datasciencegt.org",
    });
    await sendJudgeAddedEmail({
      email: "judge@example.com",
      hackathonName: "Hacklytics: Digital Bloom",
      host: "https://datasciencegt.org",
    });
    expect(sent).toHaveLength(2);
    for (const message of sent) {
      expect(message.text).toContain(
        "Joining the Hacklytics Discord is required for judges. Schedules and room changes are posted there.",
      );
      expect(message.text).toContain("Open the judge portal: https://datasciencegt.org/judge");
      expect(message.text).not.toContain("!");
    }
  });
});

describe("volunteer emails", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  const volunteerUrl =
    "https://datasciencegt.org/hackathons/hacklytics-digital-bloom/volunteer";

  it("confirms a Hacklytics volunteer, says the Discord is required and links the portal", async () => {
    await sendVolunteerApprovedEmail({
      email: "ada@example.com",
      hackathonName: "Hacklytics: Digital Bloom",
      volunteerUrl,
    });

    const [message] = sent;
    expect(message?.subject).toBe("You're confirmed as a Hacklytics volunteer");
    expect(message?.text).toContain("It is required for volunteers");
    expect(message?.text).toContain("Hacklytics Discord");
    expect(message?.text).toContain(`Open your volunteer page: ${volunteerUrl}`);
    expect(message?.html).toContain(`href="${volunteerUrl}"`);
    expect(message?.html).toContain("hacklytics-wordmark.png");
    // Calm copy: no exclamation marks, no promise of scanner access.
    expect(message?.text).not.toMatch(/!|scanner/i);
  });

  it("declines politely and briefly, without a link to anything", async () => {
    await sendVolunteerDeclinedEmail({
      email: "ada@example.com",
      hackathonName: "Hacklytics: Digital Bloom",
    });

    const [message] = sent;
    expect(message?.subject).toBe("Your Hacklytics volunteer application");
    expect(message?.text).toContain("We can't place you this time.");
    expect(message?.text).not.toMatch(/!/);
    expect(message?.html).toContain("hacklytics-wordmark.png");
    expect(message?.html).not.toContain("<a href=\"https://datasciencegt.org/hackathons");
  });

  it("names another hackathon and keeps the DS@GT look", async () => {
    await sendVolunteerApprovedEmail({
      email: "ada@example.com",
      hackathonName: "Spring Build Jam",
      volunteerUrl: "https://datasciencegt.org/hackathons/spring-build-jam/volunteer",
    });

    expect(sent[0]?.subject).toBe("You're confirmed as a Spring Build Jam volunteer");
    expect(sent[0]?.text).toContain("join the event Discord");
    expect(sent[0]?.html).toContain("DataScience<span");
  });
});
