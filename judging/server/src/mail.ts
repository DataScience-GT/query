import nodemailer from "nodemailer";

/** Sends the sign-in code when PANEL_SMTP_URL is set. */
export async function sendLoginCode(smtpUrl: string, to: string, code: string) {
  const transport = nodemailer.createTransport(smtpUrl);
  await transport.sendMail({
    from: process.env.PANEL_SMTP_FROM ?? "panel@localhost",
    to,
    subject: "Your panel sign-in code",
    text: `Your sign-in code is ${code}. It expires in 10 minutes.`,
  });
}
