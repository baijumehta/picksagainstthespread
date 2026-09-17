import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, normalizePhone } from "../phone";

function e164(raw: string): string | null {
  const r = normalizePhone(raw);
  assert.equal(r.ok, true, `expected ${raw} to be accepted`);
  return (r as { ok: true; e164: string | null }).e164;
}

test("however someone types a US number, it lands in E.164", () => {
  for (const input of [
    "5551234567",
    "555-123-4567",
    "(555) 123-4567",
    "555.123.4567",
    "555 123 4567",
    " 5551234567 ",
    "1-555-123-4567",
    "15551234567",
    "+1 (555) 123-4567",
  ]) {
    assert.equal(e164(input), "+15551234567", `failed on ${input}`);
  }
});

test("blank clears the number rather than failing", () => {
  assert.equal(e164(""), null);
  assert.equal(e164("   "), null);
  const r = normalizePhone(null);
  assert.equal(r.ok, true);
});

test("a number that is too short is rejected with a useful message", () => {
  const r = normalizePhone("123-4567");
  assert.equal(r.ok, false);
  assert.match((r as { ok: false; message: string }).message, /area code/i);
});

test("a non-North-American number is kept in international form", () => {
  assert.equal(e164("+44 7700 900123"), "+447700900123");
});

test("junk is rejected", () => {
  assert.equal(normalizePhone("not a phone").ok, false);
  assert.equal(normalizePhone("+1").ok, false);
  assert.equal(normalizePhone("999999999999999999").ok, false);
});

test("normalising is idempotent, so re-saving never corrupts a number", () => {
  const once = e164("(555) 123-4567")!;
  assert.equal(e164(once), once);
});

test("display formatting is readable, and round-trips", () => {
  assert.equal(formatPhone("+15551234567"), "(555) 123-4567");
  assert.equal(e164(formatPhone("+15551234567")), "+15551234567");
  assert.equal(formatPhone(null), "");
  assert.equal(formatPhone("+447700900123"), "+447700900123", "non-US shown as stored");
});
