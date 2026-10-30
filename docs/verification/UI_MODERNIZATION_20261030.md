# UI modernization — 30 October 2026

User direction: modernize checkout, merchant and admin interfaces; retain the
black/red identity and existing functionality; keep dense data practical.

## Changes

- Shared custom theme, bundled Inter font and FilsPay favicon; no component kit.
- Persistent desktop navigation and compact, scrollable phone navigation.
- Consistent sign-in, payment, form, detail and operational table presentation.
- Right-aligned currency and tabular digits; financial formatters are unchanged.
- Table viewports contain long references at all sizes and support keyboard focus.
- Visible focus, skip links, clearer selected tabs, semantic status colors and
  readable primary button contrast (independently measured 4.74:1).
- Mobile date filters use two columns; text inputs avoid iOS focus zoom.

No API request, payment handler, permission gate, role rule or financial
calculation was changed. 1 BD remains exactly 1000 integer fils.

## Verification

- Both frontend TypeScript checks and production builds pass.
- Merchant unit tests: 9 passed. Dependency installation audited 0 vulnerabilities.
- Real PostgreSQL fixture database `filspay_browser_ui_20261030`: browser suite
  passed 18 grouped checks with 30 screenshots, no uncaught exceptions, 5xx
  responses or document overflow.
- Actual flows: merchant/admin password and OTP, rejection of pending sessions,
  every main navigation section, payment-link creation, simulated card checkout,
  partial then full refund, and both logout/session revocation paths.
- The 1000-fils checkout was fully refunded; the ledger retained zero fee.
- Independent QA verified route/handler preservation, long-content containment,
  primary contrast, font loading and keyboard-scroll access. Detail/form pages
  passed at 320px and 768px, alongside the main 390px/1440px browser checks.
- Webhook endpoint detail, expanded response bodies, status filtering and four
  checkout terminal states were also rendered using explicit UI response fixtures.
  These fixture checks did not register an endpoint or send a webhook.
- Mechanical design scan found only two recommendations about Inter's popularity;
  the existing font choice is intentionally retained and now actually self-hosted.
- `git diff --check` passes.

The browser harness now matches the existing Month/Year checkout labels and
records desktop/mobile navigation evidence. It also asserts viewport containment.
The local run used a temporary loopback-origin adjustment for its checkout URL;
the tracked harness uses the API's configured checkout URL unchanged.

## Evidence and limits

Evidence is in [evidence/ui-modernization](evidence/ui-modernization): original
sign-in captures, final real-flow screenshots/results, independent detail checks
and explicitly identified UI fixtures. Review artifacts use seeded/demo data.

This verifies the local UI change. It does not claim a new production deployment,
live capacity measurement, physical-device test or complete browser-engine matrix.
The existing Vite warning about the helpers module's mixed static/dynamic imports
remains; it does not fail the build. Deployment and backend configuration were
outside this change.
