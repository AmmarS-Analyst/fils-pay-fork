import { Link } from "react-router-dom";

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link className="fp-back-link" to={to}>
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
      {children}
    </Link>
  );
}
