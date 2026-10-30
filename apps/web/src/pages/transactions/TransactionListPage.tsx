import { DateInput } from "../../../../shared-ui/DateInput.js";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RowLink, RowLinkHeader } from "../../../../shared-ui/RowLink.js";
import { listTransactions } from "../../api/transactions.js";
import { describeError } from "../../api/client.js";
import { Pagination } from "../../components/Pagination.js";
import { bhd, dash, dateTime, dayStartIso } from "../../format.js";
import { classNames, pluralize, truncateMiddle } from "../../utils/helpers.js";
import type { TransactionDto, TransactionStatus } from "../../types.js";

const STATUSES: TransactionStatus[] = [
  "authorized",
  "captured",
  "partially_captured",
  "voided",
  "partially_refunded",
  "refunded",
  "chargeback",
];

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * `GET /v1/transactions`. Every control here is a real server-side
 * query param — nothing fetches an unfiltered page and narrows it in the
 * browser, which would both lie about the result count and break pagination.
 */
// YA: from/to are UTC day starts, see dayStartIso
export function TransactionListPage() {
  const [statuses, setStatuses] = useState<TransactionStatus[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce only the text box — the checkbox/date controls fire immediately,
  // since those are discrete choices, not a stream of keystrokes.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (cursor: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listTransactions({
          status: statuses.length > 0 ? statuses : undefined,
          from: dayStartIso(from),
          to: dayStartIso(to),
          search: search || undefined,
          limit: PAGE_SIZE,
          cursor: cursor ?? undefined,
        });
        setTransactions((previous) =>
          cursor ? [...previous, ...result.transactions] : result.transactions,
        );
        setNextCursor(result.nextCursor);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
      }
    },
    [statuses, from, to, search],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  function toggleStatus(status: TransactionStatus): void {
    setStatuses((previous) =>
      previous.includes(status) ? previous.filter((s) => s !== status) : [...previous, status],
    );
  }

  return (
    <section>
      <h1>Transactions</h1>

      <fieldset className="dash-filters">
        <legend>Status</legend>
        {STATUSES.map((status) => (
          <label key={status}>
            <input
              type="checkbox"
              checked={statuses.includes(status)}
              onChange={() => toggleStatus(status)}
            />
            {status.replace(/_/g, " ")}
          </label>
        ))}
      </fieldset>

      <fieldset className="dash-filters">
        <legend>Filter</legend>
        <DateInput label="From" value={from} onValueChange={setFrom} />
        <DateInput label="To (exclusive)" value={to} onValueChange={setTo} />
        <label>
          Search
          <input
            type="search"
            placeholder="Reference, acquirer reference, or transaction id"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
      </fieldset>

      {error ? <p className="dash-error">{error}</p> : null}

      <p>{pluralize(transactions.length, "transaction")} loaded</p>

      <div className="fp-table-scroll" tabIndex={0} role="region" aria-label="Scrollable data table">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Occurred</th>
              <th>Reference</th>
              <th>Status</th>
              <th className="dash-num">Authorized</th>
              <th className="dash-num">Captured</th>
              <th className="dash-num">Refunded</th>
              <th>Acquirer reference</th>
              <RowLinkHeader />
            </tr>
          </thead>
          <tbody>
            {transactions.map((txn) => (
              <tr key={txn.id}>
                <td>
                  <Link to={`/dashboard/transactions/${txn.id}`}>{dateTime(txn.occurredAt)}</Link>
                </td>
                <td>{dash(txn.reference)}</td>
                <td>
                  <span className={classNames("dash-status", `dash-status-${txn.status}`)}>{txn.status.replace(/_/g, " ")}</span>
                </td>
                <td className="dash-num">{bhd(txn.amountFils)}</td>
                <td className="dash-num">{bhd(txn.capturedFils)}</td>
                <td className="dash-num">{txn.refundedFils > 0 ? bhd(txn.refundedFils) : "—"}</td>
                <td>
                  <code>{truncateMiddle(txn.acquirerReference, 20)}</code>
                </td>
                <td className="fp-row-link-cell"><RowLink to={`/dashboard/transactions/${txn.id}`} label={`View transaction ${txn.reference ?? txn.id}`} /></td>
              </tr>
            ))}
            {transactions.length === 0 && !loading ? (
              <tr>
                <td colSpan={8}>No transactions match these filters.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {loading ? <p>Loading...</p> : null}

      <Pagination nextCursor={nextCursor} loading={loading} onLoadMore={() => void load(nextCursor)} />
    </section>
  );
}
