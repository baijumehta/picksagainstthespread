/**
 * Phase one only needs sign-in links. Phase two ("nudge the people who have
 * not picked") reuses sendMail, so keep this the single outbound path.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
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
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) {
    throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
  }
}
