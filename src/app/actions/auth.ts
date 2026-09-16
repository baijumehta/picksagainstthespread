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
  await requestLoginLink(parsed.data);
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
