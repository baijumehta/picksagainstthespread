/**
 * Phone numbers, stored the way an SMS provider needs them.
 *
 * Twilio and every other gateway want E.164 -- "+15551234567", no spaces, no
 * punctuation, country code included. People type "(555) 123-4567" or
 * "555.123.4567" or "1-555-123-4567". Normalise on the way in so phase two
 * does not inherit 28 differently-formatted strings, and pretty-print on the
 * way out so the admin screen stays readable.
 *
 * North America only for now, which is the whole pool. A number already in
 * international form is kept as-is so it is not mangled.
 */

export type PhoneResult =
  | { ok: true; e164: string | null }
  | { ok: false; message: string };

/**
 * Normalise to E.164. An empty input is valid and clears the number.
 */
export function normalizePhone(raw: string | null | undefined): PhoneResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, e164: null };

  // Already international: keep it, just strip the formatting.
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, message: "That international number does not look right." };
    }
    return { ok: true, e164: `+${digits}` };
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) return { ok: true, e164: `+1${digits}` };
  if (digits.length === 11 && digits.startsWith("1")) return { ok: true, e164: `+${digits}` };

  if (digits.length < 10) {
    return { ok: false, message: "That is too short for a mobile number — include the area code." };
  }
  return {
    ok: false,
    message: "That does not look like a US mobile number. Try 555-123-4567.",
  };
}

/** "+15551234567" -> "(555) 123-4567". Anything else is shown unchanged. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (!m) return e164;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}
