# Live security checks (Fri 2026-10-30, http://139.59.62.5)

Run from outside with merchant A's API key (Alpha Retail Co) against merchant
B's data (Beta Digital Services). Expected: nothing of B's is readable or
writable by A, and nothing internal is reachable from the internet.

| Attempt | Result |
|---|---|
| A reads B's transaction / its events | 404 / 404 |
| A captures / voids B's transaction | 404 / 404 |
| A refunds B's transaction through A's own merchant path | 404 |
| A refunds B's transaction with B's merchant id in the URL | 403 |
| A lists B's payment links / webhooks (B's merchant id in the URL) | 403 / 403 |
| A reads B's API keys (needs a dashboard session) | 401 |
| Merchant key on the admin API, or no auth at all | 401 / 401 |
| No auth / garbage bearer on the transactions API | 401 / 401 |
| SQL-looking transaction id | 404 |
| Negative or fractional `amountFils` | 400 / 400 |
| Unsigned acquirer callback | 400 |
| Suspended merchant's existing API key | 401 (finding #66) |
| Postgres 5432, API 3000, settlement 8091 from the internet | not reachable |
| `/v1/transactions/..%2f..%2fadmin` | Caddy normalises the path to `/admin`, outside `/v1`: serves the public app shell, no data |

Every merchant-scoped query uses the merchant from the session or API key,
never an id from the URL or body; ids in the URL are only compared against it
(403) or used inside a merchant-scoped lookup (404, which also hides whether
the id exists).
