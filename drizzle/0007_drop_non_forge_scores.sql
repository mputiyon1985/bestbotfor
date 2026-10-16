-- Drop editorial rows for slugs that are not in Forge's CSV
-- (src/data/scores-pros-cons.csv). The first scores seed wrote a sample
-- for cursor: features 4, value 3, ease 3, quality 4, overall 3.6, plus
-- pros and cons. Cursor is one of the blank tools and is not in that file.
-- Claude and ChatGPT from the same sample are in the CSV, so this leaves
-- them for the seed to upsert. Safe to run more than once.
-- Delete-only, and only these slugs: cursor
DELETE FROM tool_pros_cons
WHERE tool_id IN (SELECT id FROM tools WHERE slug IN ('cursor'));

DELETE FROM tool_scores
WHERE tool_id IN (SELECT id FROM tools WHERE slug IN ('cursor'));
