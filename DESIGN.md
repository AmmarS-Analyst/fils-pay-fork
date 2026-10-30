# FilsPay interface

The checkout, merchant dashboard and admin console share a compact black/red
system in `apps/shared-ui/theme.css`. This is an operating interface: clear
financial data and predictable actions take priority over decoration.

- Dark graphite canvas, slightly raised data surfaces and restrained red actions.
- Self-hosted Inter Variable; tabular numerals for financial comparisons.
- Persistent desktop sidebar, horizontally scrollable navigation on phones.
- Compact table rows, right-aligned currency, clear headers and semantic statuses.
- Tables scroll inside keyboard-focusable regions at every viewport width.
- Consistent form controls, focus indicators, disabled states and feedback colors.
- Narrow sign-in and checkout forms retain their existing wording and behavior.
- All public and administrative states retain their original permission checks.

No financial formatter, request handler or authorization decision belongs in this
visual layer. Prefer shared tokens and styles to route-specific overrides.
