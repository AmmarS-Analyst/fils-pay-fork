#!/usr/bin/env -S npx tsx
/**
 * One-off March 2026 reconciliation sweep. Finance wants the scheme
 * rounding residue (the gap between what gets journaled at capture and
 * what the scheme export can actually carry at 2 decimal places) written
 * off for March before the books close on it. Run manually, once — see
 * scripts/out/reconcile-2026-03.log for the last real run's output.
 *
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/reconcile_march.ts
 */
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { formatBhd, toFils } from "@filspay/money";

/** Asia/Bahrain is UTC+3 with no DST. */
const BAHRAIN_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The Asia/Bahrain calendar month as UTC instants (batches use the Bahrain day, not UTC). */
export function monthBounds(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1) - BAHRAIN_OFFSET_MS),
    end: new Date(Date.UTC(year, month, 1) - BAHRAIN_OFFSET_MS),
  };
}

export interface ResidueRow {
  merchantId: string;
  capturedFils: number;
}

/** The fils truncated away when a captured amount is quantized down to the
 *  scheme export's 2-decimal-place granularity. */
// MK: % 10 on a non-negative int. correct.
export function computeResidueFils(capturedFils: number): number {
  return capturedFils % 10;
}

interface MerchantResidue {
  merchantId: string;
  lineCount: number;
  residueFils: number;
}

async function fetchResidueRows(client: Client, year: number, month: number): Promise<ResidueRow[]> {
  const result = await client.query<{ merchant_id: string; captured_fils: string }>(
    `SELECT sb.merchant_id,
            (SUM(te.amount_fils) - sel.amount_fils) AS captured_fils
       FROM scheme_export_lines sel
       JOIN settlement_batches sb ON sb.id = sel.settlement_batch_id
       JOIN transaction_events te ON te.settlement_batch_id = sb.id
                                 AND te.transaction_id = sel.transaction_id
                                 AND te.event_type IN ('captured', 'partially_captured')
      WHERE sb.batch_date >= $1::date AND sb.batch_date < $2::date
        AND NOT EXISTS (
          SELECT 1 FROM ledger_entries le
           WHERE le.settlement_batch_id = sb.id AND le.transaction_id = sel.transaction_id
             AND le.description = 'scheme export: rounding residue'
        )
      GROUP BY sb.merchant_id, sel.id, sel.amount_fils
      HAVING SUM(te.amount_fils) > sel.amount_fils
      ORDER BY sb.merchant_id, sel.id`,
    [`${year}-${String(month).padStart(2, "0")}-01`, `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`],
  );
  // capturedFils here is already the per-line residue (0..9), so grouping
  // preserves the public computeResidueFils helper's existing contract.
  return result.rows.map((r) => ({ merchantId: r.merchant_id, capturedFils: Number(r.captured_fils) }));
}

/**
 * One correction group per merchant. lineCount counts exported scheme lines
 * whose actual capture delta leaves a non-zero residue.
 */
function groupByMerchant(rows: ResidueRow[]): MerchantResidue[] {
  const byMerchant = new Map<string, MerchantResidue>();
  for (const row of rows) {
    const residue = computeResidueFils(row.capturedFils);
    const existing = byMerchant.get(row.merchantId);
    if (existing) {
      existing.lineCount += 1;
      existing.residueFils += residue;
    } else {
      byMerchant.set(row.merchantId, { merchantId: row.merchantId, lineCount: 1, residueFils: residue });
    }
  }
  return [...byMerchant.values()];
}

/**
 * Posts one merchant's March residue per ADR-0002 (credit card_scheme_clearing,
 * debit scheme_rounding_residue) dated at the end of March. Skips merchants
 * already posted, so a re-run doesn't double it.
 */
async function postResidueCorrection(client: Client, merchant: MerchantResidue, periodEnd: Date): Promise<void> {
  if (merchant.residueFils <= 0) return;
  const description = "March 2026 scheme rounding residue sweep — manual recon per finance";
  const already = await client.query(
    `SELECT account_id, direction, amount_fils, occurred_at, entry_group_id FROM ledger_entries WHERE merchant_id = $1 AND description = $2`,
    [merchant.merchantId, description],
  );
  if (already.rowCount) {
    const valid = already.rows.length === 2
      && already.rows[0].entry_group_id === already.rows[1].entry_group_id
      && already.rows.every((r) => Number(r.amount_fils) === merchant.residueFils
        && new Date(r.occurred_at).getTime() === periodEnd.getTime() - 1)
      && already.rows.some((r) => r.account_id === "card_scheme_clearing" && r.direction === "credit")
      && already.rows.some((r) => r.account_id === "scheme_rounding_residue" && r.direction === "debit");
    if (!valid) throw new Error(`reconcile_march: legacy incorrect sweep for ${merchant.merchantId}; reverse and reconcile explicitly before retrying`);
    return;
  }
  const entryGroupId = randomUUID();
  const effectiveAt = new Date(periodEnd.getTime() - 1);
  await client.query(
    `INSERT INTO ledger_entries (entry_group_id, merchant_id, account_id, direction, amount_fils, occurred_at, description)
     VALUES ($1, $2, 'card_scheme_clearing', 'credit', $3, $4, $5),
            ($1, $2, 'scheme_rounding_residue', 'debit', $3, $4, $5)`,
    [entryGroupId, merchant.merchantId, merchant.residueFils, effectiveAt.toISOString(), description],
  );
}

/** Serialized, atomic sweep. Existing invalid historical sweeps fail visibly. */
export async function reconcileMarch(client: Client): Promise<number> {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('filspay:reconcile-march-2026'))");
    const rows = await fetchResidueRows(client, 2026, 3);
    const merchants = groupByMerchant(rows);
    const { end } = monthBounds(2026, 3);
    for (const merchant of merchants) await postResidueCorrection(client, merchant, end);
    await client.query("COMMIT");
    return merchants.reduce((sum, merchant) => sum + merchant.residueFils, 0);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("reconcile_march: DATABASE_URL environment variable is not set");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const residue = await reconcileMarch(client);
    console.log(`March reconciliation checked: ${formatBhd(toFils(residue))} BD residue; existing valid postings skipped`);
  } finally {
    await client.end();
  }
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
