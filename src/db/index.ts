import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { garwinPool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString, max: 5 });
}

// Reuse one pool across hot reloads in development.
const pool = globalForDb.garwinPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.garwinPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
