// An in-memory Postgres (PGlite) on a TCP port, so the database tests can run on a
// machine with neither Postgres nor Docker.
//   node tools/ai/pglite-server.mjs [port]      (default 55432)
//   DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres?sslmode=disable npm run migrate
// Limits: PGlite is ONE shared session, so tests that need a second concurrent
// connection or that deliberately break a transaction cannot pass here (use a real
// Postgres for those). Start a fresh server per full test run.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.argv[2] ?? 55432);
const db = await PGlite.create({ extensions: { pgcrypto } });
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 50 });
await server.start();
console.log(`pglite listening on 127.0.0.1:${port}`);
