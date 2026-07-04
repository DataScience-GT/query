import nodemailer from "nodemailer";

export async function sendAcceptanceEmail({
  email,
  hackathonName,
  host = "https://datasciencegt.org"
}: {
  email: string;
  hackathonName: string;
  host?: string;
}) {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT || "587"),
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
    pool: true,
  });

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

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "noreply@datasciencegt.org",
    to: email,
    subject: `You're accepted to ${hackathonName}!`,
    text: `Congratulations! You have been accepted to participate in ${hackathonName}. Head over to ${host}/hackathons to view the details.`,
    html,
  });
}
