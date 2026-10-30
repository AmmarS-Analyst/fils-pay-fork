import type { Pool } from "pg";
import { ConflictError } from "../lib/errors.js";

export type DeleteWebhookEndpointResult = "deleted" | "not_found";

/**
 * `DELETE /v1/merchants/:merchantId/webhook-endpoints/:id` business logic.
 * The statement carries the merchant-scoped predicate, never `id` alone. A hard
 * delete, not a status flip — `PATCH .../status: 'disabled'` (update.ts) is
 * the separate tool for "pause without losing history."
 *
 * The delivery log is an audit trail, and webhook_deliveries.endpoint_id is
 * NOT NULL with no ON DELETE rule (migration 0022), so an endpoint that has
 * any deliveries cannot be deleted: that used to surface as a database error
 * (500). It is now a 409 telling the caller to disable it instead.
 */
export async function deleteWebhookEndpoint(
  pool: Pool,
  input: { merchantId: string; id: string },
): Promise<DeleteWebhookEndpointResult> {
  try {
    const result = await pool.query<{ id: string }>(
      `DELETE FROM webhook_endpoints WHERE id = $1 AND merchant_id = $2 RETURNING id`,
      [input.id, input.merchantId],
    );
    return result.rows[0] ? "deleted" : "not_found";
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      throw new ConflictError("endpoint_has_deliveries", "this endpoint has delivery history; disable it instead of deleting it");
    }
    throw err;
  }
}
