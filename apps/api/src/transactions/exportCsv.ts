import type { Pool } from "pg";
import { formatBhd, toFils } from "@filspay/money";
import type { TransactionRow } from "./serialize.js";

export interface TransactionsExportFilters {
  merchantId: string;
  from?: Date;
  to?: Date;
  status?: string[];
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(row: TransactionRow): string {
  return [
    row.id,
    row.status,
    formatBhd(toFils(Number(row.amount_fils))),
    formatBhd(toFils(Number(row.captured_fils))),
    csvEscape(row.reference ?? ""),
    row.occurred_at.toISOString(),
  ].join(",");
}

const CSV_HEADER = "id,status,amount_bhd,captured_bhd,reference,occurred_at";
const EXPORT_PAGE_SIZE = 1000;

/**
 * Yields the export a page at a time so memory stays flat. Keyset on
 * (occurred_at, id) with a text cursor: a millisecond Date cursor skipped rows
 * that share the page-boundary timestamp.
 */
export async function* exportTransactionsCsvChunks(
  pool: Pool,
  filters: TransactionsExportFilters,
  pageSize = EXPORT_PAGE_SIZE,
): AsyncGenerator<string> {
  yield CSV_HEADER + "\n";
  const statusArray = filters.status && filters.status.length > 0 ? filters.status : null;
  let cursor: { ts: string; id: string } | null = null;

  for (;;) {
    const result: { rows: Array<TransactionRow & { cursor_ts: string }> } = await pool.query(
      `SELECT *, occurred_at::text AS cursor_ts FROM transactions
        WHERE merchant_id = $1
          AND ($2::timestamptz IS NULL OR occurred_at >= $2)
          AND ($3::timestamptz IS NULL OR occurred_at <  $3)
          AND ($4::text[] IS NULL OR status = ANY($4))
          AND ($5::timestamptz IS NULL OR (occurred_at, id) > ($5::timestamptz, $6::uuid))
        ORDER BY occurred_at ASC, id ASC
        LIMIT $7`,
      [filters.merchantId, filters.from ?? null, filters.to ?? null, statusArray, cursor?.ts ?? null, cursor?.id ?? null, pageSize],
    );
    if (result.rows.length > 0) {
      yield result.rows.map((row) => toCsvRow(row) + "\n").join("");
    }
    if (result.rows.length < pageSize) return;
    const last = result.rows[result.rows.length - 1]!;
    cursor = { ts: last.cursor_ts, id: last.id };
  }
}

/** Builds the whole CSV body in memory. For tests and small callers only;
 *  the route streams via exportTransactionsCsvChunks. */
export async function buildTransactionsExportCsv(
  pool: Pool,
  filters: TransactionsExportFilters,
  pageSize = EXPORT_PAGE_SIZE,
): Promise<string> {
  let csv = "";
  for await (const chunk of exportTransactionsCsvChunks(pool, filters, pageSize)) csv += chunk;
  return csv.replace(/\n$/, "");
}
