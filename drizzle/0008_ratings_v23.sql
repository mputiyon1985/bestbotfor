-- Ratings v2.3 display columns. Existing score rows keep their numbers until
-- the seed replaces them. quiz_eligible defaults to included so a row written
-- before that seed is not dropped from the quiz. Safe to run once.

ALTER TABLE tool_scores ADD COLUMN primary_category TEXT NOT NULL DEFAULT '';
ALTER TABLE tool_scores ADD COLUMN category_rank_display TEXT NOT NULL DEFAULT '';
ALTER TABLE tool_scores ADD COLUMN tie_group TEXT NOT NULL DEFAULT '';
ALTER TABLE tool_scores ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE tool_scores ADD COLUMN rating_status TEXT NOT NULL DEFAULT '';
ALTER TABLE tool_scores ADD COLUMN quiz_eligible INTEGER NOT NULL DEFAULT 1;
