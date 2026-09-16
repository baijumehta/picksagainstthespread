import type { Config } from "drizzle-kit";
// drizzle-kit does not read .env.local on its own, and that is where the
// connection string lives, so load it the same way Next.js would.
import "./scripts/env";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Fill it in in .env.local.");
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
} satisfies Config;
