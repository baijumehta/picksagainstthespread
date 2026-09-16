/**
 * Load env the way Next.js does: .env.local wins, .env is the fallback.
 * Import this first in any standalone script.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
