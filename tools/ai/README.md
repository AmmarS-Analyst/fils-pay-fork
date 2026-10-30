# AI setup for this repository

How AI agents were set up and used on this project. Everything here is plain files you can read and run.

| File | What it is |
|---|---|
| `/CLAUDE.md`, `/AGENTS.md`, `/.cursorrules` | Agent instructions. They replace the original files, which claimed money is in cents, the day is UTC and tests must never change (see `BUGS.md`). |
| `commands/verify-finding.md` | Slash command: reproduce a suspected bug before touching code. |
| `commands/new-bug.md` | Slash command: fix one bug as one commit, with a test that fails on the old code. |
| `commands/check-money.md` | Slash command: scan for the money patterns behind most bugs. |
| `claude-settings.example.json` | Permission rules (allow tests and local git, ask before push, docker and deploy, deny force-push and secrets). |
| `money-smells.sh` | grep-based scanner for float/cents/UTC/int32/`Math.random` patterns. |
| `pglite-server.mjs`, `run-db-tests.sh`, `check-migrations.mjs` | Run the database tests and check every migration on a machine with no Postgres or Docker. |

To activate the commands and permissions in Claude Code:

```bash
mkdir -p .claude && cp -r tools/ai/commands .claude/commands
cp tools/ai/claude-settings.example.json .claude/settings.json   # then delete the "_comment" key
```

## Testing without Postgres or Docker

```bash
npm install --prefix tools/ai                       # PGlite, once
node tools/ai/check-migrations.mjs                  # all migrations apply?
node tools/ai/pglite-server.mjs 55432 &             # in-memory Postgres
export DATABASE_URL="postgres://postgres@127.0.0.1:55432/postgres?sslmode=disable"
npm run migrate
bash tools/ai/run-db-tests.sh                       # one file at a time, prints non-clean files
```

PGlite is a single shared session. Tests that need a second concurrent connection, or that deliberately fail a transaction (`payRace`, the "forced audit-write failure" tests, the reporting atomicity test), fail there for that reason only; run them on a real Postgres.

## The working method (what the agent was told, and why)

1. Distrust comments, changelogs and "covered elsewhere" remarks. They were wrong in many places (`BUGS.md` quotes them).
2. Reproduce first. Every fix has a test that was shown to **fail on the old code** (stash the fix, keep the test, run it, then restore).
3. A test can encode the bug. Several did; they were corrected with the reason in the commit.
4. One bug, one commit, smallest change.
