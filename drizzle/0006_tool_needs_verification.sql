-- Flag a catalog row that still needs a fresh check. The tool stays listed under its current name.
-- Existing rows default to verified-enough (0). The seed upserts the real flag.

ALTER TABLE tools ADD COLUMN needs_verification INTEGER NOT NULL DEFAULT 0;
