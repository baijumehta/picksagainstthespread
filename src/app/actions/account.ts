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
/**
 * Turn auto-picks on or off for yourself.
 *
 * Stores the moment of opting in, not just a flag, because only games that
 * lock *after* that moment are ever filled in. Switching this on mid-season
 * must not reach back and put picks into weeks already played.
 */
export async function setAutoPickAction(
  enabled: boolean,
): Promise<{ ok: boolean; message: string; enabled: boolean }> {
  const me = await requirePlayer();
  const at = enabled ? new Date() : null;

  await db.update(players).set({ autoPickOptedInAt: at }).where(eq(players.id, me.id));
  revalidatePath("/account");
  revalidatePath("/picks");

  return {
    ok: true,
    enabled,
    message: enabled
      ? "On. Any game you have not picked when it kicks off will be set to the favourite."
      : "Off. A game you do not pick will be left blank.",
  };
}

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
