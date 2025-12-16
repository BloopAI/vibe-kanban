-- Add assigned_ports column to track port assignments from .env.vibe processing
-- Stores JSON object like {"WEB_PORT": 3000, "API_PORT": 3001}
ALTER TABLE task_attempts ADD COLUMN assigned_ports TEXT;
