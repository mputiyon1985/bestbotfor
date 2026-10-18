-- Records Beehiiv's status when a subscriber row is parked as failed.
-- invalid, paused, and needs_attention land here so reconcile does not retry them.
-- Additive. Nothing is dropped.

ALTER TABLE subscribers ADD COLUMN beehiiv_status TEXT;
