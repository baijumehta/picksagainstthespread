"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, requestLoginLink } from "@/lib/auth";

const emailSchema = z.string().trim().toLowerCase().email();

export async function requestLinkAction(_prev: unknown, formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false as const, message: "That does not look like an email address." };
  }
  try {
    await requestLoginLink(parsed.data);
  } catch (err) {
    // Swallow deliberately. A send failure must not show up here, because an
    // address in the pool would then error while an unknown one succeeded --
    // which is exactly the difference the identical reply below exists to
    // hide. The failure goes to the server log instead.
    console.error("[auth] could not send sign-in link:", err);
  }

  // Always the same answer, so this cannot be used to probe who is in the pool.
  return {
    ok: true as const,
    message: "If that address is in the pool, a sign-in link is on its way.",
  };
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}
