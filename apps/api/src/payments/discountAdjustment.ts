import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { applyRateFils, toFils } from "@filspay/money";
import { BadRequestError } from "../lib/errors.js";


/**
 * Parses a promotional discount amount (BD string from the merchant
 * pricing dashboard) into fils for the ledger adjustment.
 */
export function parsePromotionalDiscountFils(raw: string): number {
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BadRequestError("invalid_discount", `could not parse discount amount "${raw}"`);
  }
  return Math.round(parsed * 100);
}

/** Posts this capture's discount in the same transaction as its MDR fee. */
export async function applyCaptureDiscountAdjustmentInTx(
  client: PoolClient,
  input: { merchantId: string; transactionId: string; feeBeforeDiscount: number },
): Promise<number> {

  const merchantRow = await client.query<{ negotiated_discount_bps: number }>(
    `SELECT negotiated_discount_bps FROM merchants WHERE id = $1`,
    [input.merchantId],
  );
  const discountBps = merchantRow.rows[0]?.negotiated_discount_bps ?? 0;
  if (discountBps === 0) return 0;

  const feeBeforeDiscount = input.feeBeforeDiscount;
  const discountFils = applyRateFils(toFils(feeBeforeDiscount), discountBps);
  if (discountFils <= 0) return 0;

  const entryGroupId = randomUUID();
  await client.query(
    `INSERT INTO ledger_entries
       (entry_group_id, merchant_id, transaction_id, account_id, direction, amount_fils, occurred_at, description)
     VALUES
       ($1, $2, $3, 'platform_fee_revenue', 'debit',  $4, now(), 'capture: negotiated discount adjustment'),
       ($1, $2, $3, 'merchant_payable',     'credit', $4, now(), 'capture: negotiated discount adjustment')`,
    [entryGroupId, input.merchantId, input.transactionId, discountFils],
  );
  return discountFils;
}
