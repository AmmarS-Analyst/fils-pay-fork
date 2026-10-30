# Hosting FilsPay

One server (1 vCPU, 2 GB RAM, Docker + Docker Compose v2). One command deploys it:

```bash
git clone <your fork> && cd <fork>
./ops/deploy.sh          # first run: creates ops/.env.prod with fresh secrets and stops
nano ops/.env.prod       # set PUBLIC_URL, SITE_ADDRESS, ADMIN_ADDRESS, ACME_EMAIL
./ops/deploy.sh          # builds, migrates, starts (and is also the redeploy command)
./ops/deploy.sh seed     # optional: demo merchants, transactions and an API key
```

## Architecture

```
            internet
               │  80 / 443 / 8443
        ┌──────▼───────┐
        │  edge        │  Caddy: TLS (automatic), security headers, static web + admin,
        │  (96 MB)     │  proxies /v1 and /healthz to the API
        └──────┬───────┘
  private      │ :3000
  network ┌────▼─────┐   :8091 (internal token)   ┌────────────┐
          │  api     │ ─────────────────────────► │ settlement │ Go: daily close, payouts,
          │ 0.5 vCPU │                            │  (160 MB)  │ scheme export, balance cache
          │ 512 MB   │                            └─────┬──────┘
          └────┬─────┘      ┌───────────────┐           │
               │            │  reporting    │           │
               │            │  (192 MB)     │           │
               │            └───────┬───────┘           │
               └──────────┬─────────┴───────────────────┘
                    ┌─────▼─────┐
                    │ postgres  │  16, volume `pgdata`
                    │ (640 MB)  │
                    └───────────┘
```

| Service | Port | Reachable from the internet? |
|---|---|---|
| edge | 80 (redirect to 443), 443, 8443 | **yes** |
| api | 3000 | no (only through edge `/v1`, `/healthz`, `/readyz`) |
| settlement | 8091 (internal API, bearer token) | no |
| reporting | none | no |
| postgres | 5432 | no |

URLs (with `SITE_ADDRESS=shop.example.com`):

| What | URL |
|---|---|
| Merchant dashboard and hosted checkout | `https://shop.example.com` (checkout links look like `/checkout/<token>`) |
| Admin console | `https://shop.example.com:8443` |
| Public API | `https://shop.example.com/v1/...` |
| Health | `https://shop.example.com/healthz`, `/readyz` |

The admin console is on the same host as the merchant side on purpose: "view as merchant" sets a cookie on the API response, and cookies are shared across ports of one host, so impersonation works. Both front ends are built for the same origin as the API, so there is no CORS to configure.

## Secrets

`ops/deploy.sh` generates them on first run into `ops/.env.prod` (mode 600, gitignored, never committed): the Postgres password, the settlement internal token, the acquirer callback signing secret and the webhook encryption key. Nothing secret is in the repository or in an image. To rotate one, edit the file and run `./ops/deploy.sh`. (Rotating the webhook encryption key makes stored webhook secrets unreadable; recreate the endpoints.)

## Health checks and restart policies

| Service | Health check | Restart |
|---|---|---|
| postgres | `pg_isready` every 5 s | `unless-stopped` |
| api | `GET /readyz` every 10 s (40 s start period) | `unless-stopped` |
| edge | starts only after the API is healthy | `unless-stopped` |
| settlement, reporting | none (no HTTP surface in the image); crash = restart | `unless-stopped` |
| migrate | one-shot, must finish before api/settlement/reporting start | `no` |

Resource limits: API 0.5 vCPU / 512 MB with the Node heap capped at 384 MB so it is restarted by the limit, not killed mid-request.

## Redeploying without interrupting a settlement run

- Every batch close is **one database transaction**, and re-running a day is safe (closed and paid batches are skipped).
- `settlement` has `stop_grace_period: 90s`: on a redeploy it receives SIGTERM and the running close is given time to finish; if it is cut off, the transaction rolls back and the next daily tick closes the day again. Nothing is half-posted.
- `docker compose up -d` only recreates services whose image or settings changed, so a front-end-only change does not touch settlement.
- Migrations run first and only apply what is new; none of them rewrites existing money data.
- Avoid redeploying within a few minutes after Bahrain midnight (00:00–00:30), when the daily close runs.

## OTP (decision to review)

The project has no email or SMS provider. With `NODE_ENV=production` the login code is generated but delivered nowhere, so nobody could log in. The hosted stack therefore sets `OTP_DEV_EXPOSE=true`, which returns the code in the login response (the dashboards show it). That keeps the demo and the automated tests usable but means the second factor is **not a real second factor** here. Before real use: integrate an email/SMS sender in `apps/api/src/auth/notifier.ts` and set `OTP_DEV_EXPOSE=false`.

## Other open points

- All services use one database role. A least-privilege role per service (as the compose file's old TODO says) is not done.
- No rate limiting or load shedding yet at the edge or in the API (see the capacity section of the roadmap).
- This stack has been **validated** (`docker compose config`, front ends built for same-origin) but not yet **started** on a real server by me; the first deploy is the first full test. Plain-HTTP smoke test: set `SITE_ADDRESS=:80`, `ADMIN_ADDRESS=:8443`, `PUBLIC_URL=http://<server-ip>`, `COOKIE_SECURE=false`.

## Live instance (Fri 2026-10-30)

| | |
|---|---|
| Merchant dashboard + checkout | http://139.59.62.5 (`/dashboard/login`, `/pay/<token>`) |
| Admin | http://139.59.62.5:8443 |
| API | http://139.59.62.5/v1 · health `/healthz`, `/readyz` |
| Server | DigitalOcean droplet, Ubuntu 24.04, 1 vCPU / 2 GB + 2 GB swap, Docker 29 + Compose 2.40 from Ubuntu packages |
| Code | `~/sites/fils-pay` (clone of the public fork), env in `ops/.env.prod` (mode 600, secrets generated on the box) |

No domain was provided, so it runs on plain HTTP (`SITE_ADDRESS=:80`,
`COOKIE_SECURE=false`). With a domain, set `SITE_ADDRESS`/`ADMIN_ADDRESS`/`PUBLIC_URL`
and `COOKIE_SECURE=true` and rerun `ops/deploy.sh`; Caddy then gets a certificate.

Checked from outside after deploy: health/readiness, security headers, admin
port, OTP login, and through the API a capture → full refund (`refunded`) and a
capture → partial refund 5.000 of 20.000 (`partially_refunded`), with a further
20.000 refund rejected (`422 refund_exceeds_refundable`, 15.000 left). Two bugs
were found while doing this (BUGS #63, #64) and fixed before going live.

Notes:
* Docker publishes ports through its own iptables rules, so 8443 is reachable
  although ufw lists only 22/80/443.
* The organisers' log agent ships journald and syslog; container logs stay in
  Docker's json files (`./ops/deploy.sh logs <service>`).
* `seed` prints API keys twice: its self-check re-runs the generator. The keys
  that work are the **second** set printed.
