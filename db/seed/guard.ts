/**
 * The seed truncates merchants, ledger, transactions and more before it
 * regenerates them. Running it against a database that already has merchants
 * (staging-2 was reset this way, see RUNBOOK) destroys real data, so it must be
 * asked for explicitly.
 */
export async function assertSafeToReseed(
  db: { query: (sql: string) => Promise<{ rows: Array<{ n: string }> }> },
  env: Record<string, string | undefined>,
): Promise<void> {
  if (env.SEED_RESET === "1") return;
  const result = await db.query("SELECT count(*)::text AS n FROM merchants");
  const merchants = Number(result.rows[0]?.n ?? 0);
  if (merchants > 0) {
    throw new Error(
      `seed: this database already has ${merchants} merchant(s) and the seed would erase them. ` +
        "Check DATABASE_URL, then re-run with SEED_RESET=1 if you really mean to reset it.",
    );
  }
}
