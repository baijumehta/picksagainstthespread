/**
 * Check that email actually sends before anyone depends on it.
 *
 *   npm run mail:test -- --to you@example.com
 *
 * Reports Resend's own error verbatim, because the two failures you will
 * actually hit -- a bad key and an unverified sending domain -- look nothing
 * alike and are fixed in different places.
 */
import "./env";
import { mailFrom, mailIsConfigured, mailProvider, sendMail } from "../src/lib/mail";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const to = arg("to");
  if (!to) {
    console.error("Usage: npm run mail:test -- --to you@example.com");
    process.exit(1);
  }

  const from = mailFrom();
  console.log(`provider   : ${mailProvider()}${mailIsConfigured() ? "" : " (will print to console, not send)"}`);
  console.log(`from       : ${from}`);
  console.log(`to         : ${to}\n`);

  try {
    await sendMail({
      to,
      subject: "Picks pool: email is working",
      text: "If you are reading this, sign-in links will reach the pool.\n",
      html: "<p>If you are reading this, sign-in links will reach the pool.</p>",
    });
    console.log(
      mailIsConfigured()
        ? "Sent. Check that inbox (and its spam folder)."
        : "Printed above -- set SMTP2GO_API_KEY (or RESEND_API_KEY) to send for real.",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nFAILED: ${message}\n`);
    if (/SMTP2GO/i.test(message)) {
      console.error(
        "Usually one of:\n" +
        "  - the address in MAIL_FROM is not a verified sender or domain on the\n" +
        "    SMTP2GO account\n" +
        "  - the API key does not have send permission\n" +
        "  - the recipient is on the account's suppression list",
      );
    } else if (message.includes("403") || /domain/i.test(message)) {
      console.error("That usually means the sending domain in MAIL_FROM is not verified.");
    } else if (message.includes("401")) {
      console.error("The provider rejected the API key.");
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
