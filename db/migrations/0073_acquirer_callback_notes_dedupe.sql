-- FP-201: the acquirer redelivers callbacks (at-least-once) and we stored a
-- second identical note each time. 0051 claims dedupe happens in a
-- processed_events table and an FP-238 unique index; neither exists.
--
-- Remove the exact redeliveries already stored (keep the first copy of each
-- callback_id), then make callback_id unique so the insert can use
-- ON CONFLICT DO NOTHING.
DELETE FROM acquirer_callback_notes a
 USING acquirer_callback_notes b
 WHERE a.callback_id = b.callback_id
   AND (a.created_at, a.id) > (b.created_at, b.id);

CREATE UNIQUE INDEX acquirer_callback_notes_callback_id_key
    ON acquirer_callback_notes (callback_id);
