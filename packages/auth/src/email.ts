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

/**
 * One announcement to one recipient — "registration is open", "schedule is
 * live", "results are up".
 *
 * `body` is plain text written by an organiser in the admin panel. It is
 * escaped and then newline-split into paragraphs: treating it as HTML would
 * make the compose box an injection point into thousands of inboxes.
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
  const bodyHtml = body
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 16px 0;">${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || "noreply@datasciencegt.org",
    to: email,
    subject,
    text: body,
    html: renderShell({ heading, bodyHtml, ctaLabel, ctaUrl }),
  });
}

export async function sendAcceptanceEmail({
  email,
  hackathonName,
  host = "https://datasciencegt.org"
}: {
  email: string;
  hackathonName: string;
  host?: string;
}) {
  const mainColor = "#10b981";
  const backgroundColor = "#0f172a";
  const textColor = "#f8fafc";

  const safeHackathonName = hackathonName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const safeHost = host
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const html = `
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
        <h2 style="color: ${textColor}; font-size: 20px; font-weight: 400; margin-bottom: 16px;">You're Accepted!</h2>
        <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          Congratulations! You have been accepted to participate in <strong>${safeHackathonName}</strong>.
        </p>
        <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          Head over to the <a href="${safeHost}/hackathons" style="color: ${mainColor}; text-decoration: none; font-weight: 600;">Hackathon Hub</a> to view the event details, find a team, and get ready to build!
        </p>
        <div style="margin: 32px auto;">
          <a href="${safeHost}/hackathons" style="display: inline-block; padding: 12px 24px; background: ${mainColor}; color: #020617; text-decoration: none; font-weight: 600; border-radius: 6px;">Go to Hackathon Hub</a>
        </div>
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

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || "noreply@datasciencegt.org",
    to: email,
    subject: `You're accepted to ${hackathonName}!`,
    text: `Congratulations! You have been accepted to participate in ${hackathonName}. Head over to ${host}/hackathons to view the details.`,
    html,
  });
}
