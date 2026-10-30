-- A sequence ID is allocated before commit, so it cannot be a consumption
-- boundary. Preserve known processed history; future passes find every visible
-- event without a receipt, including lower IDs committed after a higher ID.
CREATE TABLE reporting_processed_events (
    consumer_name TEXT NOT NULL,
    outbox_event_id BIGINT NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_name, outbox_event_id)
);

INSERT INTO reporting_processed_events (consumer_name, outbox_event_id)
SELECT cursor.consumer_name, event.id
  FROM reporting_outbox_cursor cursor
  JOIN outbox_events event ON event.id <= cursor.last_processed_id
 WHERE event.event_type IN ('transaction.captured', 'transaction.voided',
                            'settlement.batch_closed', 'refund.succeeded');

-- Historical events already skipped by the former cursor cannot be inferred
-- from its watermark. Run reporting rebuild to reconstruct those projections.
