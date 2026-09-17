"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { players } from "@/db/schema";
import { requirePlayer } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";

/**
 * A player setting their own mobile number.
 *
 * Deliberately the only field they can change about themselves: initials are
 * how the pool identifies them and email is how they sign in, so both stay
 * with the commissioner.
 */
export async function saveMyPhoneAction(
  raw: string,
): Promise<{ ok: boolean; message: string; phone: string | null }> {
  const me = await requirePlayer();

  const phone = normalizePhone(raw);
  if (!phone.ok) return { ok: false, message: phone.message, phone: me.phone };

  await db.update(players).set({ phone: phone.e164 }).where(eq(players.id, me.id));
  revalidatePath("/account");
  revalidatePath("/admin/players");

  return {
    ok: true,
    message: phone.e164 ? "Mobile number saved." : "Mobile number removed.",
    phone: phone.e164,
  };
}
