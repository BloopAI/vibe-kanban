-- Add repository type to projects table to support both GitHub and GitLab
ALTER TABLE projects ADD COLUMN repo_type TEXT NOT NULL DEFAULT 'github' 
    CHECK (repo_type IN ('github', 'gitlab'));

-- Update existing projects to detect their repo type based on remote URL
UPDATE projects 
SET repo_type = CASE 
    WHEN git_repo_path LIKE '%gitlab%' THEN 'gitlab'
    ELSE 'github'
END
WHERE repo_type = 'github';