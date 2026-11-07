import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

// Reuse the connection across hot reloads in dev so we don't exhaust Postgres.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

const client = globalForDb.pgClient ?? postgres(env.DATABASE_URL, { max: 10 });
if (env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
