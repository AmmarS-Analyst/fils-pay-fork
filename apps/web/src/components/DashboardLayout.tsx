import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useDashboardAuth } from "../auth/DashboardAuthContext.js";
import { RequireRole } from "../auth/RequireRole.js";
import { describeError } from "../api/client.js";
import "../dashboard.css";

/** Nav shell for every merchant dashboard screen. No impersonation banner
 *  here — nothing in the merchant plane impersonates anyone; when an admin
 *  "views as merchant", they arrive with a `support`-role session and see
 *  exactly what a support user sees. */
export function DashboardLayout() {
  const { me, signOut } = useDashboardAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // sign out clears the cookie server side, local merchantId stays — am
  async function handleSignOut(): Promise<void> {
    setError(null);
    try {
      await signOut();
      navigate("/dashboard/login", { replace: true });
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <div className="dash-shell">
      <a className="fp-skip-link" href="#main-content">Skip to content</a>
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <span className="dash-brand-mark" aria-hidden="true" />
          <span>FilsPay</span>
        </div>
        <nav className="dash-nav" aria-label="Merchant dashboard">
          <NavLink to="/dashboard/transactions">Transactions</NavLink>
          <NavLink to="/dashboard/payment-links">Payment links</NavLink>
          {/* Every webhook route — including the plain list read — is
              owner/finance-only server-side, so the link itself is
              hidden from support rather than offered and then refused. */}
          <RequireRole allow={["owner", "finance"]}>
            <NavLink to="/dashboard/webhooks">Webhooks</NavLink>
          </RequireRole>
          <NavLink to="/dashboard/settlement">Settlement</NavLink>
          <RequireRole allow={["owner", "finance"]}>
            <NavLink to="/dashboard/reconciliation">Reconciliation</NavLink>
          </RequireRole>
          <NavLink to="/dashboard/overview">Overview</NavLink>
        </nav>
        <div className="dash-sidebar-foot">
          <span className="dash-sidebar-foot-dot" aria-hidden="true" />
          Bahrain time · UTC+3
        </div>
      </aside>

      <div className="dash-stage">
        <header className="dash-header">
          <div className="dash-identity">
            {me ? (
              <>
                <span className="dash-identity-merchant">{me.merchant.displayName}</span>
                <span className="dash-identity-email">{me.email}</span>
                <span className="dash-role-chip">{me.role}</span>
              </>
            ) : null}
          </div>
          <button type="button" className="dash-button dash-signout" onClick={() => void handleSignOut()}>
            Log out
          </button>
        </header>

        {error ? <p className="dash-error dash-global-error">{error}</p> : null}

        <main className="dash-main" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
