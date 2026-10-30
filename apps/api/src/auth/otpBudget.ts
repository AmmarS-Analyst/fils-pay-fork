import type { Pool } from "pg";
import { TooManyRequestsError } from "../lib/errors.js";

/** Reserve a guess atomically across sessions and resends, before comparison.
 * The row is bounded per account and survives failed password-step restarts.
 */
export async function reserveAccountOtpAttempt(
  pool: Pool,
  accountType: "merchant" | "admin",
  accountId: string,
  maxAttempts: number,
): Promise<void> {
  const reserved = await pool.query(
    `INSERT INTO account_otp_attempt_budgets (account_type, account_id, attempt_count)
       VALUES ($1, $2, 1)
     ON CONFLICT (account_type, account_id) DO UPDATE
       SET attempt_count = CASE WHEN account_otp_attempt_budgets.window_started_at <= now() - interval '10 minutes'
                                THEN 1 ELSE account_otp_attempt_budgets.attempt_count + 1 END,
           window_started_at = CASE WHEN account_otp_attempt_budgets.window_started_at <= now() - interval '10 minutes'
                                    THEN now() ELSE account_otp_attempt_budgets.window_started_at END
       WHERE account_otp_attempt_budgets.attempt_count < $3
          OR account_otp_attempt_budgets.window_started_at <= now() - interval '10 minutes'
     RETURNING account_id`,
    [accountType, accountId, maxAttempts],
  );
  if (!reserved.rows[0]) throw new TooManyRequestsError("too_many_attempts");
}
