-- Add automatic updated_at triggers for all tables with updated_at columns
-- This ensures updated_at is always set when a row is modified

-- Projects table trigger
CREATE TRIGGER projects_updated_at_trigger
AFTER UPDATE ON projects
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE projects
    SET updated_at = datetime('now', 'subsec')
    WHERE id = NEW.id;
END;

-- Tasks table trigger  
CREATE TRIGGER tasks_updated_at_trigger
AFTER UPDATE ON tasks
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE tasks
    SET updated_at = datetime('now', 'subsec')
    WHERE id = NEW.id;
END;

-- Task attempts table trigger
CREATE TRIGGER task_attempts_updated_at_trigger
AFTER UPDATE ON task_attempts
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE task_attempts
    SET updated_at = datetime('now', 'subsec')
    WHERE id = NEW.id;
END;

-- Execution processes table trigger
CREATE TRIGGER execution_processes_updated_at_trigger
AFTER UPDATE ON execution_processes
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE execution_processes
    SET updated_at = datetime('now', 'subsec')
    WHERE id = NEW.id;
END;

-- Task templates table trigger
CREATE TRIGGER task_templates_updated_at_trigger
AFTER UPDATE ON task_templates
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE task_templates
    SET updated_at = datetime('now', 'subsec')
    WHERE id = NEW.id;
END;

-- Executor sessions table trigger
CREATE TRIGGER executor_sessions_updated_at_trigger
AFTER UPDATE ON executor_sessions
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE executor_sessions
    SET updated_at = datetime('now', 'subsec')
    WHERE id = NEW.id;
END;
