-- platform_stats.total_processed_fils was INTEGER (int32, max 2,147,483,647
-- fils = 2,147,483.647 BD) while the volume tier triggers at 2,000,000,000
-- fils. Settlement added in int32, so ~147,484 BD after the tier switched on
-- the counter wrapped negative and the discount switched off again.
-- ADR-0001: money columns are BIGINT.
ALTER TABLE platform_stats ALTER COLUMN total_processed_fils TYPE BIGINT;
