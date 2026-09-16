/**
 * First-run setup: create the current season and the commissioner account.
 *
 *   npm run db:seed -- --email you@example.com --initials BJM
 *
 * Safe to re-run; it will not duplicate anything.
 */
import "./env";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { players, seasons } from "../src/db/schema";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg("email") ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const initials = (arg("initials") ?? process.env.ADMIN_INITIALS ?? "").trim().toUpperCase();
  const year = Number(arg("year") ?? new Date().getFullYear());

  if (!email || !initials) {
    console.error(
      "Usage: npm run db:seed -- --email you@example.com --initials BJM [--year 2026]",
    );
    process.exit(1);
  }

  const existingSeason = await db.query.seasons.findFirst({ where: eq(seasons.year, year) });
  if (existingSeason) {
    console.log(`Season ${year} already exists.`);
  } else {
    await db.update(seasons).set({ isCurrent: false });
    await db.insert(seasons).values({ year, isCurrent: true });
    console.log(`Created season ${year}.`);
  }

  const existingPlayer = await db.query.players.findFirst({ where: eq(players.email, email) });
  if (existingPlayer) {
    if (!existingPlayer.isAdmin) {
      await db.update(players).set({ isAdmin: true }).where(eq(players.id, existingPlayer.id));
      console.log(`Promoted ${existingPlayer.initials} to commissioner.`);
    } else {
      console.log(`${existingPlayer.initials} is already the commissioner.`);
    }
  } else {
    await db.insert(players).values({ initials, email, isAdmin: true });
    console.log(`Created commissioner ${initials} <${email}>.`);
  }

  console.log("\nDone. Start the app and sign in with that email address.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
