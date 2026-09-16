/**
 * Phase one only needs sign-in links. Phase two ("nudge the people who have
 * not picked") reuses sendMail, so keep this the single outbound path.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body. Clients that cannot render it fall back to `text`. */
  html?: string;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super("RESEND_API_KEY is not set, so nothing can be emailed yet.");
    this.name = "MailNotConfiguredError";
  }
}

export function mailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendMail(msg: MailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "Picks Pool <onboarding@resend.dev>";

  if (!apiKey) {
    // No provider configured yet -- print it so local dev still works.
    console.log(
      `\n[mail] (no RESEND_API_KEY, printing instead)\n  to: ${msg.to}\n  subject: ${msg.subject}\n  ${msg.text}\n`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Resend's own message is the useful part -- an unverified sending domain
    // and a bad key look nothing alike, and the caller only sees a log line.
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

/** Minimal, readable HTML for the sign-in email. */
export function signInEmailHtml(initials: string, url: string, minutes: number): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16181d">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #dfe3e9;border-radius:12px;padding:24px">
    <p style="margin:0 0 16px;font-size:15px">Hi ${escapeHtml(initials)},</p>
    <p style="margin:0 0 20px;font-size:15px">Here is your sign-in link for the picks pool.</p>
    <p style="margin:0 0 20px">
      <a href="${url}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:15px">Sign in and make your picks</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#5d6573">
      It expires in ${minutes} minutes and works once.
    </p>
    <p style="margin:0;font-size:12px;color:#5d6573;word-break:break-all">
      If the button does not work, paste this in: ${url}
    </p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
