-- Addresses saved before Beehiiv is configured stay pending.
-- Rows already sent to Beehiiv are synced and are the only ones a count includes.
-- Additive. Production prebuild applies this file.

ALTER TABLE subscribers ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

UPDATE subscribers SET status = 'synced' WHERE destination = 'beehiiv';
