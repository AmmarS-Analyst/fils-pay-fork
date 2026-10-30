# FilsPay — The Handover (team Sparkies)

FilsPay is a Bahraini payment gateway: merchants take card payments through a
hosted checkout, refund them, and are paid out daily by a settlement run. We
were handed the codebase, audited it, fixed what was wrong, built the refunds
feature (FP-300) and host it live.

| | |
|---|---|
| **Live** | http://139.59.62.5 — merchant dashboard `/dashboard/login`, checkout `/pay/<token>` |
| **Admin console** | http://139.59.62.5:8443 |
| **Public API** | http://139.59.62.5/v1 · health `/healthz`, `/readyz` |
| **Team** | Abdu (captain) · Hafiz Muhammad Ammar Siddiqui |

## What we did

- **82 findings**, each with its own commit, the smallest fix and a test that
  fails on the old code: 21 critical, 44 high, 16 medium, 1 low.
  Full report: [`BUGS.md`](BUGS.md).
- **FP-300 refunds**: full and partial, idempotent, over-refund safe, netted in
  settlement. [`FP-300.md`](FP-300.md).
- **Hosted** on one 1 vCPU / 2 GB server with Docker Compose behind Caddy.
  [`docs/DEPLOY.md`](docs/DEPLOY.md).
- **Capacity measured on the live server**: ~37 payments/s, excess turned away
  with `503 Retry-After`, a crash in the middle of an overload run lost or
  doubled nothing. [`docs/CAPACITY.md`](docs/CAPACITY.md).
- **Live security checks** (cross-merchant, admin, tampered ids):
  [`docs/SECURITY_CHECKS.md`](docs/SECURITY_CHECKS.md).
- **UI/UX** before and after: [`docs/UI_CHANGES.md`](docs/UI_CHANGES.md).
- **Independent verification** (real PostgreSQL + Go, browser QA):
  [`docs/verification/`](docs/verification/).

**Main root cause:** the system's invariants lived in comments and in
misleading agent instruction files, not in code. Money is integer **fils**
(1 BD = 1000 fils), the business day is **Asia/Bahrain**, every query is scoped
to the authenticated merchant, and money moves exactly once.

## Stack

| Part | Technology |
|---|---|
| `apps/api` | TypeScript, Node.js 22, Fastify, `pg` |
| `apps/settlement` | Go 1.22, pgx v5 — daily close, payouts, scheme export |
| `apps/reporting` | TypeScript worker on a transactional outbox (PostgreSQL LISTEN/NOTIFY) |
| `apps/web`, `apps/admin` | React 18, Vite 7, React Router 7; shared theme in `apps/shared-ui` |
| `packages/money` | integer-fils parsing and half-even rounding |
| Database | PostgreSQL 16, double-entry `ledger_entries` (append-only) |
| Hosting | Docker Compose, Caddy edge (TLS, security headers, reverse proxy) |

## Run it

```bash
# full production stack (Docker + Compose v2)
./ops/deploy.sh          # first run writes ops/.env.prod with fresh secrets, then stops
./ops/deploy.sh          # build, migrate, start — also the redeploy command
./ops/deploy.sh seed     # demo merchants, transactions and API keys

# development
npm ci
npm run typecheck
npm test                                  # DB tests need DATABASE_URL (a migrated Postgres)
cd apps/settlement && go test -p 1 ./...  # Go
```

No Docker or Postgres? `tools/ai/README.md` starts an in-memory Postgres.

Demo logins (seeded test data only): merchant `owner@alpharetail.example` /
`FilsPaySeed!2026` with Alpha Retail Co's merchant id; admin
`superadmin@filspay.test` / `FilsPayAdminSeed!2026`. The one-time code is shown
on screen in the hosted demo — why: [`docs/DEPLOY.md`](docs/DEPLOY.md) ("OTP").

## AI setup

| What | Where |
|---|---|
| Agent instructions | [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), [`.cursorrules`](.cursorrules), [`tools/ai/CODEX.md`](tools/ai/CODEX.md) |
| Custom commands | [`tools/ai/commands/`](tools/ai/commands/) (`/verify-finding`, `/new-bug`, `/check-money`) |
| Tool configuration and permission rules | [`tools/ai/claude-settings.example.json`](tools/ai/claude-settings.example.json) |
| Helper scripts | [`tools/ai/`](tools/ai/) (money-smell scanner, in-memory Postgres, per-file test runner, migration check), [`tools/load/`](tools/load/) (load and overload-integrity tests), [`scripts/verification/`](scripts/verification/) |

The original `CLAUDE.md`, `AGENTS.md` and `.cursorrules` were decoys (money in
cents, UTC days, "never change tests"); they were rewritten with the real rules.
