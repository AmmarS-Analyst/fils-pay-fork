# Current verification status

Date: 2026-10-30. Work branch: `verify/submission-audit`. Baseline: `submission` / `fd8f395`. No push or merge.

Read [the verification checkpoint](docs/verification/VERIFICATION_20261030.md) and [independent QA](docs/verification/INDEPENDENT_QA_20261030.md) before continuing. They supersede historical verification numbers in BUGS.md and FP-300.md.

Verified: isolated real-PostgreSQL API454, reporting15, money40, events4, web8, scripts9 and seed1 pass; strict TypeScript and both frontend builds pass. Go104pass/2fail/1skip. Actual browser merchant/admin OTP, navigation, checkout, partial/full refunds and logout pass. Local API cgroup0.5CPU/512MiB load conserves money through64clients; throughput saturates near9checkouts/s with rising latency.

Two unchanged settlement tests assert superseded exclusion/deferral behavior. Shared-DB npm test is also not green because archived webhook fixtures poison reporting. Latest user instructions prohibit regression-file edits: preserve the failures and resolve that policy before changing those assertions/fixtures. Do not label the checkpoint all green.

Next: resolve acceptance conflicts, then hosted acceptance, real OTP transport, provider recovery, remaining4dependency findings. Docker/Dilmune were not run. Do not discard historical data or unknown provider-operation fences.

Reproduce isolated tests using `PATH=<go-bin>:$PATH scripts/verification/run-suites.sh` with a dedicated local PostgreSQL server at127.0.0.1:55439 and userfilspay. The script creates fresh databases and retains them; it never resets an existing database. Follow the verification document for runtime and load evidence.
