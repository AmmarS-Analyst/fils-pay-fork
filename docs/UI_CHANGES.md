# UI/UX changes

Four small commits on `apps/web`, each with a reason. Screenshots are taken at
390 px (phone) and 1100 px (desktop) with a headless Chrome against the Vite
dev server and a stub of the payment-link API (the stub only answers the two
checkout calls; the declined card ends in `0002`). "Before" is the code at
`3ef637d`, "after" is the tip of `submission`.

| # | Commit | What was wrong | What changed |
|---|---|---|---|
| 1 | `10c93e3` checkout form | On a phone the CVV box ran off the right edge, the month label wrapped, the card number was one 16-digit blob, CVV was visible, the browser could not autofill, errors were silent for screen readers, help text was 4.4:1 contrast | Inputs size to their column (grid), card number grouped in fours (digits only go to the API), CVV masked and capped at 4 digits, `autocomplete` tokens (`cc-number`, `cc-exp-month`, `cc-exp-year`, `cc-csc`), `role="alert"` on errors, visible focus ring, 4.5:1+ help text, clear primary button |
| 2 | `445b661` dashboard times | `toLocaleString()` used the viewer's zone, so a payment could show on a different day than the settlement report | Times render in Asia/Bahrain; the layout says "Times are shown in Bahrain time (UTC+3)". Test fails on the old code when the browser zone is not Bahrain |
| 3 | `3be814f` checkout success | Showed a raw ISO string (`2026-10-30T14:02:51.585Z`) and never said how much was paid | Receipt-style screen: amount, merchant, reference, readable Bahrain time, receipt number |
| 4 | `f1b485f` refund drawer | Errors not announced, amount box needed a click, no quick way to refund the remainder | Amount focused on open, `role="alert"` errors, "Use full amount" button; a partial refund is still a typed amount |

## Before / after

| Screen | Before | After |
|---|---|---|
| Phone, filled form | ![](ui/before-checkout-mobile-2-filled.png) | ![](ui/after-checkout-mobile-2-filled.png) |
| Phone, success | ![](ui/before-checkout-mobile-4-success.png) | ![](ui/after-checkout-mobile-4-success.png) |
| Desktop, form | ![](ui/before-checkout-desktop-1-form.png) | ![](ui/after-checkout-desktop-1-form.png) |
| Desktop, declined | ![](ui/before-checkout-desktop-5-declined.png) | ![](ui/after-checkout-desktop-5-declined.png) |

The other screens (processing, desktop success, phone form and declined) are
in `docs/ui/` with the same names.

## Not changed, on purpose

* Visual restyle of the merchant dashboard: not worth the risk this close to
  the deadline; the checkout and the refund path are what a judge uses.
* The refund drawer and dashboard were not screenshotted (they need a login
  session; the stub does not fake one). Those two changes are covered by the
  type check, the build and the unit test for the date helper.
* The checkout still prints the simulated-acquirer test-card help text. It is
  true and useful for the demo; remove it for a real launch.
