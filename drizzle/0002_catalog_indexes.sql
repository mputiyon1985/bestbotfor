CREATE INDEX IF NOT EXISTS tools_status_name_idx ON tools (status, name);
CREATE INDEX IF NOT EXISTS tool_tasks_task_idx ON tool_tasks (task_id);
