import "./scripts/env";
import { eq } from "drizzle-orm";
import { db } from "./src/db";
import { games } from "./src/db/schema";
async function main() {
  const buf = await db.query.games.findFirst({ where: eq(games.homeAbbr, "BUF") });
  await db.update(games).set({ statusDetail: "BOGUS-SENTINEL", homeScore: 99 }).where(eq(games.id, buf!.id));
  console.log("corrupted for production test");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
