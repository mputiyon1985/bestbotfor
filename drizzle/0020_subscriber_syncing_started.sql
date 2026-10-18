-- Records when a subscriber row was claimed for a Beehiiv call.
-- A crash can leave status `syncing`. Reconcile uses this age.
-- Null is stale. Additive. Nothing is dropped.

ALTER TABLE subscribers ADD COLUMN syncing_started_at INTEGER;
