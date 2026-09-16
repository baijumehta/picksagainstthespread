import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

// One client per process, in every environment.
//
// This used to be cached only outside production, which meant every property
// access on `db` (so every query) built a fresh postgres client and paid a
// full TCP + TLS + auth handshake to the hosted database -- ten-plus times per
// page render -- and the abandoned clients leaked until their idle timeout.
// Living on globalThis keeps the instance across dev hot reloads too.
const globalForDb = globalThis as unknown as {
  _pgClient?: ReturnType<typeof postgres>;
  _drizzle?: DB;
};

function connect(): DB {
  if (globalForDb._drizzle) return globalForDb._drizzle;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  }

  // Hosted Postgres poolers (Neon, Supabase, Vercel) run PgBouncer in
  // transaction mode, which rejects prepared statements -- so turn them off.
  // Serverless functions each get their own client, so keep the pool tiny.
  const isServerless = Boolean(process.env.VERCEL);
  const client =
    globalForDb._pgClient ??
    postgres(connectionString, {
      max: isServerless ? 1 : 5,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  const instance = drizzle(client, { schema });
  globalForDb._pgClient = client;
  globalForDb._drizzle = instance;
  return instance;
}

/**
 * Connects on first use rather than on import, so a build (or a page that
 * catches the error and shows setup instructions) works without the env var.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(connect() as object, prop, receiver);
  },
});

export { schema };
