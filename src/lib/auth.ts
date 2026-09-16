import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { loginTokens, players, sessions, type Player } from "@/db/schema";
import { sendMail, signInEmailHtml } from "./mail";
import { appBaseUrl } from "./base-url";

const SESSION_COOKIE = "pool_session";
const SESSION_DAYS = 60;
const TOKEN_MINUTES = 20;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/* ------------------------------------------------------------------ */
/* Magic links                                                         */
/* ------------------------------------------------------------------ */

/**
 * Email a sign-in link. There is no self-signup: unknown addresses are
 * silently ignored so this cannot be used to discover who is in the pool.
 */
export async function requestLoginLink(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const player = await db.query.players.findFirst({
    where: eq(players.email, email),
  });
  if (!player || !player.isActive) return;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_MINUTES * 60_000);
  await db.insert(loginTokens).values({
    playerId: player.id,
    tokenHash: sha256(token),
    expiresAt,
  });

  const url = `${appBaseUrl()}/login/verify?token=${token}`;
  await sendMail({
    to: player.email,
    subject: "Your sign-in link for the picks pool",
    text:
      `Hi ${player.initials},\n\n` +
      `Open this link to sign in and make your picks:\n${url}\n\n` +
      `It expires in ${TOKEN_MINUTES} minutes and works once.\n`,
    html: signInEmailHtml(player.initials, url, TOKEN_MINUTES),
  });
}

/** Consume a magic-link token and start a session. Returns false if invalid. */
export async function consumeLoginToken(token: string): Promise<boolean> {
  const hash = sha256(token);
  const row = await db.query.loginTokens.findFirst({
    where: and(
      eq(loginTokens.tokenHash, hash),
      isNull(loginTokens.usedAt),
      gt(loginTokens.expiresAt, new Date()),
    ),
  });
  if (!row) return false;

  await db.update(loginTokens).set({ usedAt: new Date() }).where(eq(loginTokens.id, row.id));
  await startSession(row.playerId);
  return true;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export async function startSession(playerId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ playerId, tokenHash: sha256(token), expiresAt });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** The signed-in player, or null. Safe to call from any server component. */
export async function getCurrentPlayer(): Promise<Player | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await db.query.sessions.findFirst({
    where: and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())),
  });
  if (!row) return null;

  const player = await db.query.players.findFirst({ where: eq(players.id, row.playerId) });
  return player && player.isActive ? player : null;
}

export async function requirePlayer(): Promise<Player> {
  const player = await getCurrentPlayer();
  if (!player) throw new Error("UNAUTHENTICATED");
  return player;
}

export async function requireAdmin(): Promise<Player> {
  const player = await requirePlayer();
  if (!player.isAdmin) throw new Error("FORBIDDEN");
  return player;
}

/** Constant-time compare for the cron shared secret. */
export function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
