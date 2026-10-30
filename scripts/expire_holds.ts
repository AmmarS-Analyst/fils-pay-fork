#!/usr/bin/env -S npx tsx
/**
 * Nightly janitor: marks holds past their window as 'expired'. One UPDATE;
 * nothing is deleted (the old DELETE ran as `DELETE FROM holds` on a night
 * with nothing to expire).
 *
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/expire_holds.ts
 */
import { pathToFileURL } from "node:url";
import { Client } from "pg";

export const EXPIRE_HOLDS_SQL =
  "UPDATE holds SET status = 'expired' WHERE status = 'active' AND expires_at < now()";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("expire_holds: DATABASE_URL environment variable is not set");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(EXPIRE_HOLDS_SQL);
    console.log(`expire_holds: expired ${result.rowCount ?? 0} hold(s)`);
  } finally {
    await client.end();
  }
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
