// Applies db/migrations/*.sql in order to a throwaway in-memory Postgres and reports
// every file that fails. This is how the two broken migrations (0054, 0055) were found.
//   node tools/ai/check-migrations.mjs [dir]
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? new URL("../../db/migrations", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const db = new PGlite();
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
let ok = 0;
for (const f of files) {
  try {
    await db.exec("BEGIN");
    // gen_random_uuid() is built into PG 13+; the extension line is not needed here.
    await db.exec(readFileSync(join(dir, f), "utf8").replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/i, ""));
    await db.exec("COMMIT");
    ok++;
  } catch (e) {
    await db.exec("ROLLBACK");
    console.log(`FAIL ${f}: ${e.message}`);
  }
}
console.log(`applied ${ok}/${files.length}`);
process.exit(ok === files.length ? 0 : 1);
