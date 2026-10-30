# Capacity

Budget for the whole stack is 1 vCPU / 2 GB; the API gets 0.5 vCPU / 512 MB
(`ops/docker-compose.prod.yml`). This page says what limits us, what we
estimate, how overload is handled and how to measure it.

## What limits throughput

`POST /v1/transactions` runs inside one DB transaction and calls the acquirer
simulator in the middle of it (`apps/api/src/payments/authorize.ts`). The
simulator answers in 100–400 ms (mean about 250 ms), so **one pooled Postgres
connection is busy for roughly a quarter of a second per payment**. With the
hosted pool of 10 (`PG_POOL_MAX=10`):

    10 connections / 0.25 s  ≈  40 authorizations per second (pool ceiling)

The DB work itself (idempotency claim, insert, ledger and outbox rows) is a
few ms but the API has half a CPU, so we expect the CPU to become the limit a
bit before the pool does.

**Estimate (before measuring): about 25–35 authorizations/s sustained, p95
under 600 ms, at the default 2 % acquirer failure rate.** This is a
back-of-envelope number; the measured one goes in the table below.

## Overload behaviour

* At most `MAX_INFLIGHT_PAYMENTS` payment writes (authorize, capture, void,
  refunds) are in flight; default is 2 × `PG_POOL_MAX` (20 hosted). Anything
  above that gets an immediate `503 {"error":"overloaded"}` with
  `Retry-After: 1` (`apps/api/src/plugins/overload.ts`). Before this, the extra
  requests queued in the pg pool until the 5 s acquire timeout and then failed
  together, so latency exploded for everyone.
* Reads, `/healthz` and `/readyz` are never shed.
* The slot is released on `close`, so a client that hangs up cannot leak one.
* Payments are idempotent (`Idempotency-Key`), so a client that retries a 503
  or a timeout cannot double-charge.

## Restart and recovery

* Every long-running container has `restart: unless-stopped`; the API has a
  healthcheck on `/readyz`.
* The pg pool drops dead connections (`pool.on("error")`) and reconnects by
  itself, so a Postgres restart does not need an API restart.
* Settlement stops with a 90 s grace period and its batches are idempotent
  and transactional, so a redeploy in the middle of a run is safe.
* Known gap: `/readyz` is a boot-time latch and does not notice a database
  that goes away later (documented upstream behaviour; the pool still
  recovers when the database returns).

## How to measure (run from any machine, ideally not the server itself)

```bash
# 1. create an API key in the merchant dashboard (Developers -> API keys)
BASE_URL=https://YOUR.DOMAIN API_KEY=fp_... LEVELS=5,10,20,40,80 SECONDS=20 \
  node tools/load/checkout.mjs
```

Watch the server at the same time: `docker stats` (API CPU should sit near
50 %) and `./ops/deploy.sh logs api`.

Recovery check while the load runs:

```bash
docker compose -f ops/docker-compose.prod.yml --env-file ops/.env.prod kill api
# the API comes back by itself; load errors for a few seconds, then recovers
curl -fsS https://YOUR.DOMAIN/readyz
```

## Measured results (live server, Fri 2026-10-30 ~21:30 AST)

Server: 1 vCPU / 2 GB droplet (139.59.62.5), API limited to 0.5 vCPU / 512 MB,
`PG_POOL_MAX=10`, `MAX_INFLIGHT_PAYMENTS=20`. Client: `tools/load/checkout.mjs`
from a laptop in Bahrain over the internet, closed loop, 12 s per level,
`POST /v1/transactions` (authorize, 12.500 BD) with a fresh Idempotency-Key per call.

| workers | req/s | ok/s | shed % | err % | p50 ms | p95 ms | p99 ms | 503 p95 ms |
|---|---|---|---|---|---|---|---|---|
| 5 | 13.8 | 13.4 | 0 | 1.2 | 364 | 509 | 709 | – |
| 10 | 27.7 | 27.1 | 0 | 0 | 370 | 500 | 548 | – |
| 20 | 37.8 | 37.1 | 0 | 0.4 | 545 | 696 | 746 | – |
| 40 | 212.9 | 36.3 | 82.5 | 0 | 627 | 830 | 926 | 129 |
| 80 | 419.9 | 31.0 | 92.5 | 0.1 | 780 | 1137 | 1307 | 250 |

* **Capacity: about 37 authorizations/s**, matching the ~40/s pool estimate
  above. At 20 concurrent users nothing is shed and p95 stays under 0.7 s.
* **Overload:** at 40 and 80 users the API keeps serving 31–36 ok/s and turns
  the excess away with `503 Retry-After: 1` in 0.1–0.25 s instead of queueing;
  accepted requests stay under 1.4 s p99. The script does not back off on
  503, so req/s at those levels is a worst-case hammering rate.
* "err %" is the simulated acquirer's built-in failure rate and declines, not
  server faults.
* **Bottleneck:** the pg connection held across the 100–400 ms acquirer call
  (10 connections / ~0.27 s), then the 0.5 vCPU.
* **Crash recovery:** killing the API process from the host (`kill -9` on the
  container PID) made Docker restart it (`restart: unless-stopped`,
  RestartCount 1); `/readyz` was 200 again after **7 s**. `docker kill` counts
  as a manual stop and is not restarted, by design.
* Abdu's earlier local measurements: `docs/verification/evidence/load-results.json`
  and `load-overload-results.json`.
