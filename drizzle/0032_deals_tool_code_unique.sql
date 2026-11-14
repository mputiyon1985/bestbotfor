-- Unique key for the member-deal seed. Additive. Nothing is dropped or rewritten.
-- The catalog seed upserts a deal on (tool_slug, code).

CREATE UNIQUE INDEX IF NOT EXISTS deals_tool_slug_code_unique ON deals (tool_slug, code);
