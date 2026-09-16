/**
 * The single outbound email path. Phase one uses it for sign-in links; phase
 * two ("nudge whoever has not picked") will reuse it.
 *
 * Provider is chosen by whichever key is present: SMTP2GO first, then Resend,
 * otherwise the message is printed to the console so local dev works with no
 * account at all.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body. Clients that cannot render it fall back to `text`. */
  html?: string;
}

export type MailProvider = "smtp2go" | "resend" | "console";

export function mailProvider(): MailProvider {
  if (process.env.SMTP2GO_API_KEY) return "smtp2go";
  if (process.env.RESEND_API_KEY) return "resend";
  return "console";
}

export function mailIsConfigured(): boolean {
  return mailProvider() !== "console";
}

export function mailFrom(): string {
  return process.env.MAIL_FROM ?? "Picks Pool <onboarding@resend.dev>";
}

export async function sendMail(msg: MailMessage): Promise<void> {
  switch (mailProvider()) {
    case "smtp2go": return sendViaSmtp2go(msg);
    case "resend": return sendViaResend(msg);
    default: return printToConsole(msg);
  }
}

function printToConsole(msg: MailMessage): void {
  console.log(
    `\n[mail] (no provider configured, printing instead)\n  to: ${msg.to}\n  subject: ${msg.subject}\n  ${msg.text}\n`,
  );
}

/**
 * SMTP2GO answers 200 with a JSON body even when the send failed, so the
 * status code alone means nothing -- the outcome is in data.succeeded /
 * data.failed. Checking only res.ok would report success for every rejected
 * recipient.
 */
async function sendViaSmtp2go(msg: MailMessage): Promise<void> {
  const res = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Smtp2go-Api-Key": process.env.SMTP2GO_API_KEY!,
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: mailFrom(),
      to: [msg.to],
      subject: msg.subject,
      text_body: msg.text,
      ...(msg.html ? { html_body: msg.html } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`SMTP2GO ${res.status}: ${raw}`);

  let body: {
    data?: { succeeded?: number; failed?: number; failures?: unknown[]; error?: string };
  };
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`SMTP2GO returned something that is not JSON: ${raw.slice(0, 200)}`);
  }

  const succeeded = body.data?.succeeded ?? 0;
  const failed = body.data?.failed ?? 0;
  if (succeeded < 1 || failed > 0) {
    const detail =
      body.data?.error ??
      (body.data?.failures?.length ? JSON.stringify(body.data.failures) : raw.slice(0, 300));
    throw new Error(`SMTP2GO accepted the request but sent nothing: ${detail}`);
  }
}

async function sendViaResend(msg: MailMessage): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY!}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // Keep the provider's own wording: a bad key and an unverified sending
    // domain look nothing alike and are fixed in different places.
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
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
