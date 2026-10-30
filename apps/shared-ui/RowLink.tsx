import { Link } from "react-router-dom";
import "./row-link.css";

/** A separate details target keeps row selection and inline actions independent. */
export function RowLink({ to, label }: { to: string; label: string }) {
  return (
    <Link className="fp-row-link" to={to} aria-label={label} title={label}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

export function RowLinkHeader() {
  return <th className="fp-row-link-cell"><span className="fp-row-link-label">Details</span></th>;
}
