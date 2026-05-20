import nodemailer from "nodemailer";
import { withTransientRetry } from "./retry.js";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

/**
 * Send the generated daily PDF report via SMTP.
 */
export async function sendReportEmail(
  config: SmtpConfig,
  to: string,
  subject: string,
  pdfBuffer: Buffer,
  filename: string
): Promise<void> {
  await withTransientRetry(async () => {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
    await transport.sendMail({
      from: config.user,
      to,
      subject,
      text: "Daily BESS compliance report attached.",
      attachments: [{ filename, content: pdfBuffer }],
    });
  });
}
