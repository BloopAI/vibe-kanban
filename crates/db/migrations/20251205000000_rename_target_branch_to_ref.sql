-- Rename target_branch to target_branch_ref and convert to full git refs

-- Rename the column
ALTER TABLE attempt_repos RENAME COLUMN target_branch TO target_branch_ref;

-- Convert known remote patterns (origin/, upstream/) to refs/remotes/
UPDATE attempt_repos
SET target_branch_ref = 'refs/remotes/' || target_branch_ref
WHERE target_branch_ref LIKE 'origin/%'
   OR target_branch_ref LIKE 'upstream/%';

-- Convert everything else to refs/heads/ (local branches)
UPDATE attempt_repos
SET target_branch_ref = 'refs/heads/' || target_branch_ref
WHERE target_branch_ref NOT LIKE 'refs/%';
