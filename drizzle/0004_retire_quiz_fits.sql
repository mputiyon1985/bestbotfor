-- Retire quiz fits removed from the catalog. Safe to run more than once:
-- deleting a pair that is already gone changes nothing.
-- The seed only upserts, so these rows would otherwise stay in tool_tasks.
-- Filename is 0004 so it sorts after 0003_tool_tasks_unique.sql.
DELETE FROM tool_tasks
WHERE EXISTS (
  SELECT 1
  FROM tools
  JOIN tasks ON tasks.id = tool_tasks.task_id
  WHERE tools.id = tool_tasks.tool_id
    AND (
      (tools.slug = 'hyperwrite' AND tasks.slug = 'seo')
      OR (tools.slug = 'wondercraft' AND tasks.slug = 'music')
      OR (tools.slug = 'podcastle' AND tasks.slug = 'music')
      OR (tools.slug = 'listnr' AND tasks.slug = 'music')
      OR (tools.slug = 'notebooklm' AND tasks.slug = 'music')
      OR (tools.slug = 'descript' AND tasks.slug = 'music')
      OR (tools.slug = 'lalal-ai' AND tasks.slug = 'music')
    )
);
