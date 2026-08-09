import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/**
 * One pooled transporter for the process, built on first use.
 *
 * `pool: true` only does anything if the transporter outlives the message.
 * Built per call it was worse than useless: every recipient paid a fresh
 * TCP + TLS + AUTH handshake and left a pool behind to be garbage collected.
 * A mass acceptance send is thousands of messages, so that is the difference
 * between a batch that finishes and one that times out.
 *
 * Lazily created so importing this module never requires SMTP config —
 * the send path is the only thing that needs it.
 */
let transporter: Transporter | null = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: Number(process.env.EMAIL_SERVER_PORT || "587"),
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
      pool: true,
      // Deliberately env-tunable. A consumer Gmail account tolerates far less
      // than a bulk provider, and the same code has to serve both: point
      // EMAIL_SERVER_* at Mailgun/SendGrid/SES and raise these, no redeploy of
      // anything but config.
      maxConnections: Number(process.env.EMAIL_MAX_CONNECTIONS || "5"),
      maxMessages: Number(process.env.EMAIL_MAX_MESSAGES || "100"),
    });
  }
  return transporter;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/**
 * The shared shell every transactional message uses, so an announcement looks
 * like it came from the same organisation as the acceptance.
 */
const renderShell = ({
  heading,
  bodyHtml,
  ctaLabel,
  ctaUrl,
}: {
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) => {
  const mainColor = "#10b981";
  const backgroundColor = "#0f172a";
  const textColor = "#f8fafc";

  const cta =
    ctaLabel && ctaUrl
      ? `<a href="${escapeHtml(ctaUrl)}" style="display: inline-block; padding: 14px 32px; background: ${mainColor}; color: #052e21; font-weight: 700; text-decoration: none; font-size: 14px; letter-spacing: 0.5px;">${escapeHtml(ctaLabel)}</a>`
      : "";

  return `
<body style="background: ${backgroundColor}; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; margin: 0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${backgroundColor}; max-width: 600px; margin: auto; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);">
    <tr>
      <td style="background: linear-gradient(90deg, #10b981 0%, #0ea5e9 100%); height: 4px;"></td>
    </tr>
    <tr>
      <td style="padding: 40px 20px; text-align: center; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255,255,255,0.05);">
        <div style="margin-bottom: 24px;">
          <h1 style="color: ${textColor}; font-size: 24px; font-weight: 300; letter-spacing: 1px; margin: 0;">DataScience<span style="font-weight: 600; color: ${mainColor};">GT</span></h1>
        </div>
        <h2 style="color: ${textColor}; font-size: 20px; font-weight: 400; margin-bottom: 16px;">${escapeHtml(heading)}</h2>
        <div style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px; text-align: left;">${bodyHtml}</div>
        ${cta}
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding: 20px; background: #020617; color: #475569; font-size: 11px;">
        &copy; ${new Date().getFullYear()} Data Science at Georgia Tech
      </td>
    </tr>
  </table>
</body>
  `;
};

const DEFAULT_HOST = "https://datasciencegt.org";

/**
 * Every message this product sends, in one shape.
 *
 * `paragraphs` is plain text — always. Each one is escaped and wrapped, so no
 * template can turn a name, a hackathon title or an organiser's compose box
 * into markup in thousands of inboxes. A template that needs a link says so
 * with `ctaUrl`, not by writing an anchor.
 */
export type TransactionalEmail = {
  email: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  ctaLabel?: string;
  ctaUrl?: string;
};

/**
 * The one send path. Templates below describe a message; this is what puts it
 * on the wire, so the shell, the from address and the plain-text alternative
 * cannot drift apart between them.
 */
export async function sendTransactionalEmail({
  email,
  subject,
  heading,
  paragraphs,
  ctaLabel,
  ctaUrl,
}: TransactionalEmail) {
  const bodyHtml = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 16px 0;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  // Text alternative, not an afterthought: a Gmail clipping or a plain-text
  // client otherwise shows a blank message, and the CTA is the whole point.
  const text = [...paragraphs, ctaUrl ? `${ctaLabel ?? "Open"}: ${ctaUrl}` : ""]
    .filter(Boolean)
    .join("\n\n");

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || "noreply@datasciencegt.org",
    to: email,
    subject,
    text,
    html: renderShell({ heading, bodyHtml, ctaLabel, ctaUrl }),
  });
}

/**
 * One announcement to one recipient — "registration is open", "schedule is
 * live", "results are up".
 *
 * `body` is plain text written by an organiser in the admin panel, split on
 * blank lines into paragraphs.
 */
export async function sendAnnouncementEmail({
  email,
  subject,
  heading,
  body,
  ctaLabel,
  ctaUrl,
}: {
  email: string;
  subject: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  await sendTransactionalEmail({
    email,
    subject,
    heading,
    paragraphs: body.split(/\n{2,}/),
    ctaLabel,
    ctaUrl,
  });
}

/**
 * Registration has opened on an edition the recipient asked to hear about.
 *
 * The interest list exists for exactly this moment and nothing sent it, so the
 * people who asked to be told found out from somewhere else, or not at all.
 */
export async function sendRegistrationOpenEmail({
  email,
  hackathonName,
  registerUrl,
  host = DEFAULT_HOST,
}: {
  email: string;
  hackathonName: string;
  registerUrl?: string;
  host?: string;
}) {
  await sendTransactionalEmail({
    email,
    subject: `Registration is open for ${hackathonName}`,
    heading: "Registration is open",
    paragraphs: [
      `You asked to hear when ${hackathonName} opened. It just did.`,
      "Spots are limited and applications are reviewed as they arrive, so it is worth registering early.",
    ],
    ctaLabel: "Register now",
    ctaUrl: registerUrl ?? `${host}/hacklytics`,
  });
}

/**
 * A judge's application was approved.
 *
 * Between applying and approval a judge had no email and no status screen,
 * while the success screen promised one.
 */
export async function sendJudgeApprovedEmail({
  email,
  hackathonName,
  host = DEFAULT_HOST,
}: {
  email: string;
  hackathonName: string;
  host?: string;
}) {
  await sendTransactionalEmail({
    email,
    subject: `You're confirmed as a judge for ${hackathonName}`,
    heading: "You're confirmed as a judge",
    paragraphs: [
      `Your application to judge ${hackathonName} has been approved.`,
      "Your judging queue is ready. On the day, scan the QR card on each table to start, score the project, and move to the next one.",
    ],
    ctaLabel: "Open the judge portal",
    ctaUrl: `${host}/judge`,
  });
}

/**
 * A decision on an application to join an initiative, or on a proposal to run
 * one.
 *
 * People applied and then heard nothing at all: the decision was recorded and
 * visible only to whoever made it, so the applicant's only option was to keep
 * checking the page.
 */
export async function sendInitiativeDecisionEmail({
  email,
  initiativeTitle,
  accepted,
  kind,
  note,
  host = DEFAULT_HOST,
}: {
  email: string;
  initiativeTitle: string;
  accepted: boolean;
  /** "application" — joining one; "proposal" — asking to run one. */
  kind: "application" | "proposal";
  note?: string | null;
  host?: string;
}) {
  const subject = accepted
    ? `You're in: ${initiativeTitle}`
    : `An update on ${initiativeTitle}`;

  const paragraphs = accepted
    ? kind === "proposal"
      ? [
          `Your proposal for ${initiativeTitle} was approved. You can now set it up and open it for applications.`,
        ]
      : [`You've been accepted to ${initiativeTitle}. Your leader will be in touch with what happens next.`]
    : kind === "proposal"
      ? [`Your proposal for ${initiativeTitle} was not taken forward this time.`]
      : [
          `Your application to ${initiativeTitle} was not accepted this time.`,
          "Other initiatives are open, and applying again later is welcome.",
        ];

  if (note) paragraphs.push(note);

  await sendTransactionalEmail({
    email,
    subject,
    heading: accepted ? "Good news" : "An update",
    paragraphs,
    ctaLabel: accepted && kind === "proposal" ? "Open your initiative" : "See initiatives",
    ctaUrl:
      accepted && kind === "proposal" ? `${host}/lead` : `${host}/initiatives`,
  });
}

/** Results are published and public. */
export async function sendResultsPublishedEmail({
  email,
  hackathonName,
  resultsUrl,
  host = DEFAULT_HOST,
}: {
  email: string;
  hackathonName: string;
  resultsUrl?: string;
  host?: string;
}) {
  await sendTransactionalEmail({
    email,
    subject: `${hackathonName} results are live`,
    heading: "Results are live",
    paragraphs: [
      `The judging for ${hackathonName} is finished and the results are published.`,
      "Thank you for building with us.",
    ],
    ctaLabel: "See the results",
    ctaUrl: resultsUrl ?? `${host}/hackathons`,
  });
}

export async function sendAcceptanceEmail({
  email,
  hackathonName,
  host = DEFAULT_HOST,
}: {
  email: string;
  hackathonName: string;
  host?: string;
}) {
  await sendTransactionalEmail({
    email,
    subject: `You're accepted to ${hackathonName}!`,
    heading: "You're accepted!",
    paragraphs: [
      `Congratulations! You have been accepted to participate in ${hackathonName}.`,
      "Head over to the Hackathon Hub to view the event details, find a team, and get ready to build.",
    ],
    ctaLabel: "Go to Hackathon Hub",
    ctaUrl: `${host}/hackathons`,
  });
}
