# Remaining dependency checkpoint QA — 2026-10-30

Bounded independent review of Vite7.3.7, @vitejs/plugin-react5.2.0 and react-router-dom7.18.5 in both SPAs. No product behavior, test files or deployment state was changed by this reviewer.

- Installed versions independently verified through npm ls; both apps share the expected versions without peer dependency errors.
- Full repository npm run typecheck passed.
- Production builds of both web/admin passed under Vite7.3.7. Existing mixed static/dynamic helper import warning remains informational and does not affect output correctness.
- Fresh independent npm audit reports0total vulnerabilities:0high,0moderate,0critical. This supersedes the earlier four-package audit snapshot for the current lockfile; it does not certify all application security.
- [Official Vite7 migration guidance](https://v7.vite.dev/guide/migration) requires Node20.19+or22.12+ and raises default browser targets to Chrome107/Firefox104/Safari16. Current host Node25 passes; floating node:22 Docker image is compatible when freshly resolved, but deployment should retain the minimum version requirement. These apps use ordinary React plugin/client builds and have no removed Sass legacy/custom SSR/HTML-transform hooks.
- React18 remains supported by the selected router/plugin combination. Existing createBrowserRouter/RouterProvider routes, nested layouts and guarded redirects retain their APIs. No splat-relative routing or custom SSR hydration path was found that requires a behavior migration.

After confirming both Vite processes restarted on upgraded packages, an independent actual Playwright subset passed9/9checks with0page errors: merchant/admin password+OTP login, merchant Overview/Payment links/Transactions navigation, admin Credits/Merchants navigation, and route reload on each plane. Used only isolated filspay_browser fixtures. Root owns the separate full18check flow and screenshots.

No new high-risk regression was found in the reviewed upgrade. Production OTP, provider and hosting readiness remain separate integration work; no external deployment was attempted.
