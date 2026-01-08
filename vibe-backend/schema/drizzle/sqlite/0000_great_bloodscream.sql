-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `_sqlx_migrations` (
	`version` integer PRIMARY KEY,
	`description` text NOT NULL,
	`installed_on` numeric DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`success` numeric NOT NULL,
	`checksum` blob NOT NULL,
	`execution_time` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` blob PRIMARY KEY,
	`project_id` blob NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`parent_workspace_id` blob,
	`shared_task_id` blob,
	`team_id` blob,
	`priority` integer DEFAULT 0,
	`due_date` text,
	`assignee_id` blob,
	`issue_number` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` blob PRIMARY KEY,
	`task_id` blob NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`setup_completed_at` numeric,
	`container_ref` text,
	`branch` text DEFAULT 'main' NOT NULL,
	`agent_working_dir` text DEFAULT '',
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` blob PRIMARY KEY,
	`file_path` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text,
	`size_bytes` integer,
	`hash` text NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_images` (
	`id` blob PRIMARY KEY,
	`task_id` blob NOT NULL,
	`image_id` blob NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `merges` (
	`id` blob PRIMARY KEY,
	`workspace_id` blob NOT NULL,
	`merge_type` text NOT NULL,
	`merge_commit` text,
	`pr_number` integer,
	`pr_url` text,
	`pr_status` text,
	`pr_merged_at` text,
	`pr_merge_commit_sha` text,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`target_branch_name` text NOT NULL,
	`repo_id` blob DEFAULT (X'00') NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` blob PRIMARY KEY,
	`tag_name` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `execution_process_logs` (
	`execution_id` blob NOT NULL,
	`logs` text NOT NULL,
	`byte_size` integer NOT NULL,
	`inserted_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_processes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scratch` (
	`id` blob NOT NULL,
	`scratch_type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	PRIMARY KEY(`id`, `scratch_type`)
);
--> statement-breakpoint
CREATE TABLE `repos` (
	`id` blob PRIMARY KEY,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_repos` (
	`id` blob PRIMARY KEY,
	`project_id` blob NOT NULL,
	`repo_id` blob NOT NULL,
	`setup_script` text,
	`cleanup_script` text,
	`copy_files` text,
	`parallel_setup_script` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_repos` (
	`id` blob PRIMARY KEY,
	`workspace_id` blob NOT NULL,
	`repo_id` blob NOT NULL,
	`target_branch` text NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `execution_process_repo_states` (
	`id` blob PRIMARY KEY,
	`execution_process_id` blob NOT NULL,
	`repo_id` blob NOT NULL,
	`before_head_commit` text,
	`after_head_commit` text,
	`merge_commit` text,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`execution_process_id`) REFERENCES `execution_processes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` blob PRIMARY KEY,
	`name` text NOT NULL,
	`dev_script` text,
	`remote_project_id` blob,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`dev_script_working_dir` text DEFAULT '',
	`default_agent_working_dir` text DEFAULT '',
	`priority` integer DEFAULT 0,
	`lead_id` blob,
	`start_date` text,
	`target_date` text,
	`status` text DEFAULT 'backlog',
	`health` integer DEFAULT 0,
	`description` text,
	`summary` text,
	`icon` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` blob PRIMARY KEY,
	`workspace_id` blob NOT NULL,
	`executor` text,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `execution_processes` (
	`id` blob PRIMARY KEY,
	`session_id` blob NOT NULL,
	`run_reason` text DEFAULT 'setupscript' NOT NULL,
	`executor_action` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`exit_code` integer,
	`dropped` integer DEFAULT 0 NOT NULL,
	`started_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `coding_agent_turns` (
	`id` blob PRIMARY KEY,
	`execution_process_id` blob NOT NULL,
	`agent_session_id` text,
	`prompt` text,
	`summary` text,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`execution_process_id`) REFERENCES `execution_processes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sqlite_stat4` (
	`tbl` text,
	`idx` text,
	`neq` text,
	`nlt` text,
	`ndlt` text,
	`sample` text
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` blob PRIMARY KEY,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`identifier` text,
	`document_storage_path` text,
	`dev_script` text,
	`dev_script_working_dir` text,
	`default_agent_working_dir` text,
	`slug` text
);
--> statement-breakpoint
CREATE TABLE `team_projects` (
	`team_id` blob NOT NULL,
	`project_id` blob NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	PRIMARY KEY(`project_id`, `team_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` blob PRIMARY KEY NOT NULL,
	`project_id` blob NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`target_date` text,
	`sort_order` integer DEFAULT 0,
	`created_at` numeric DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` numeric DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_dependencies` (
	`id` blob PRIMARY KEY NOT NULL,
	`project_id` blob NOT NULL,
	`depends_on_project_id` blob NOT NULL,
	`dependency_type` text NOT NULL,
	`created_at` numeric DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`depends_on_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_labels` (
	`id` blob PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` numeric DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_label_assignments` (
	`project_id` blob NOT NULL,
	`label_id` blob NOT NULL,
	PRIMARY KEY(`label_id`, `project_id`),
	FOREIGN KEY (`label_id`) REFERENCES `project_labels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `inbox_items` (
	`id` blob PRIMARY KEY,
	`notification_type` text DEFAULT 'task_assigned' NOT NULL,
	`title` text NOT NULL,
	`message` text,
	`task_id` blob,
	`project_id` blob,
	`workspace_id` blob,
	`is_read` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `document_folders` (
	`id` blob PRIMARY KEY,
	`team_id` blob NOT NULL,
	`parent_id` blob,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`local_path` text,
	FOREIGN KEY (`parent_id`) REFERENCES `document_folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` blob PRIMARY KEY,
	`team_id` blob NOT NULL,
	`folder_id` blob,
	`title` text NOT NULL,
	`content` text,
	`file_path` text,
	`file_type` text DEFAULT 'markdown' NOT NULL,
	`file_size` integer,
	`mime_type` text,
	`icon` text,
	`is_pinned` numeric DEFAULT (FALSE) NOT NULL,
	`is_archived` numeric DEFAULT (FALSE) NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`slug` text,
	FOREIGN KEY (`folder_id`) REFERENCES `document_folders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_repositories` (
	`id` blob PRIMARY KEY,
	`connection_id` blob NOT NULL,
	`repo_full_name` text NOT NULL,
	`repo_name` text NOT NULL,
	`repo_owner` text NOT NULL,
	`repo_url` text NOT NULL,
	`default_branch` text,
	`is_private` integer DEFAULT 0 NOT NULL,
	`linked_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`sync_path` text,
	`sync_folder_id` text,
	`last_synced_at` numeric,
	FOREIGN KEY (`connection_id`) REFERENCES `github_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_repo_sync_configs` (
	`id` blob PRIMARY KEY NOT NULL,
	`repo_id` blob NOT NULL,
	`folder_id` text NOT NULL,
	`github_path` text,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `github_repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `team_repos` (
	`id` blob PRIMARY KEY,
	`team_id` blob NOT NULL,
	`repo_id` blob NOT NULL,
	`setup_script` text,
	`cleanup_script` text,
	`copy_files` text,
	`parallel_setup_script` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`repo_id`) REFERENCES `repos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_connections` (
	`id` blob PRIMARY KEY,
	`team_id` blob,
	`access_token` text NOT NULL,
	`github_username` text,
	`connected_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` blob PRIMARY KEY,
	`team_id` blob NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`role` text DEFAULT 'contributor' NOT NULL,
	`invited_by` blob,
	`joined_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`clerk_user_id` text,
	`avatar_url` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `team_invitations` (
	`id` blob PRIMARY KEY,
	`team_id` blob NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'contributor' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` blob,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	`token` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`author_id` text,
	`author_name` text NOT NULL,
	`author_email` text,
	`content` text NOT NULL,
	`is_internal` numeric DEFAULT (FALSE) NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_document_links` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`document_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `member_project_access` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`project_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now', 'subsec')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tasks_team_issue_unique` ON `tasks` (`team_id`,`issue_number`);--> statement-breakpoint
CREATE INDEX `idx_tasks_team_issue_number` ON `tasks` (`team_id`,`issue_number`);--> statement-breakpoint
CREATE INDEX `idx_tasks_priority` ON `tasks` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_tasks_assignee_id` ON `tasks` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_due_date` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `idx_tasks_team_id` ON `tasks` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_parent_workspace_id` ON `tasks` (`parent_workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tasks_shared_task_unique` ON `tasks` (`shared_task_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_project_created_at` ON `tasks` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_workspaces_container_ref` ON `workspaces` (`container_ref`);--> statement-breakpoint
CREATE INDEX `idx_task_attempts_created_at` ON `workspaces` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_task_attempts_task_id_created_at` ON `workspaces` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_images_hash` ON `images` (`hash`);--> statement-breakpoint
CREATE INDEX `idx_task_images_image_id` ON `task_images` (`image_id`);--> statement-breakpoint
CREATE INDEX `idx_task_images_task_id` ON `task_images` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_merges_open_pr` ON `merges` (`workspace_id`,`pr_status`);--> statement-breakpoint
CREATE INDEX `idx_merges_workspace_id` ON `merges` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_merges_repo_id` ON `merges` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_execution_process_logs_execution_id_inserted_at` ON `execution_process_logs` (`execution_id`,`inserted_at`);--> statement-breakpoint
CREATE INDEX `idx_scratch_created_at` ON `scratch` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_project_repos_repo_id` ON `project_repos` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_project_repos_project_id` ON `project_repos` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_repos_repo_id` ON `workspace_repos` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_workspace_repos_workspace_id` ON `workspace_repos` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_eprs_process_repo` ON `execution_process_repo_states` (`execution_process_id`,`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_eprs_repo_id` ON `execution_process_repo_states` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_eprs_process_id` ON `execution_process_repo_states` (`execution_process_id`);--> statement-breakpoint
CREATE INDEX `idx_projects_target_date` ON `projects` (`target_date`);--> statement-breakpoint
CREATE INDEX `idx_projects_status` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `idx_projects_lead_id` ON `projects` (`lead_id`);--> statement-breakpoint
CREATE INDEX `idx_projects_priority` ON `projects` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_projects_created_at` ON `projects` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_projects_remote_project_id` ON `projects` (`remote_project_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_workspace_id_created_at` ON `sessions` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_workspace_id` ON `sessions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_execution_processes_session_run_reason_created` ON `execution_processes` (`session_id`,`run_reason`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_execution_processes_session_status_run_reason` ON `execution_processes` (`session_id`,`status`,`run_reason`);--> statement-breakpoint
CREATE INDEX `idx_execution_processes_run_reason` ON `execution_processes` (`run_reason`);--> statement-breakpoint
CREATE INDEX `idx_execution_processes_status` ON `execution_processes` (`status`);--> statement-breakpoint
CREATE INDEX `idx_execution_processes_session_id` ON `execution_processes` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_coding_agent_turns_agent_session_id` ON `coding_agent_turns` (`agent_session_id`);--> statement-breakpoint
CREATE INDEX `idx_coding_agent_turns_execution_process_id` ON `coding_agent_turns` (`execution_process_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_teams_slug` ON `teams` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_team_projects_project_id` ON `team_projects` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_team_projects_team_id` ON `team_projects` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_milestones_project_id` ON `milestones` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_dependencies_depends_on` ON `project_dependencies` (`depends_on_project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_dependencies_project_id` ON `project_dependencies` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_project_label_assignments_label` ON `project_label_assignments` (`label_id`);--> statement-breakpoint
CREATE INDEX `idx_project_label_assignments_project` ON `project_label_assignments` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_inbox_items_created_at` ON `inbox_items` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_inbox_items_workspace_id` ON `inbox_items` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_inbox_items_project_id` ON `inbox_items` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_inbox_items_task_id` ON `inbox_items` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_inbox_items_is_read` ON `inbox_items` (`is_read`);--> statement-breakpoint
CREATE INDEX `idx_document_folders_parent_id` ON `document_folders` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_document_folders_team_id` ON `document_folders` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_documents_team_slug` ON `documents` (`team_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_documents_is_archived` ON `documents` (`is_archived`);--> statement-breakpoint
CREATE INDEX `idx_documents_is_pinned` ON `documents` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `idx_documents_file_type` ON `documents` (`file_type`);--> statement-breakpoint
CREATE INDEX `idx_documents_folder_id` ON `documents` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_documents_team_id` ON `documents` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_github_repositories_sync_folder_id` ON `github_repositories` (`sync_folder_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_github_repositories_unique` ON `github_repositories` (`connection_id`,`repo_full_name`);--> statement-breakpoint
CREATE INDEX `idx_github_repositories_connection_id` ON `github_repositories` (`connection_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_configs_folder` ON `github_repo_sync_configs` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_configs_repo` ON `github_repo_sync_configs` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_team_repos_repo_id` ON `team_repos` (`repo_id`);--> statement-breakpoint
CREATE INDEX `idx_team_repos_team_id` ON `team_repos` (`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_github_connections_workspace` ON `github_connections` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_github_connections_team_id` ON `github_connections` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_team_members_clerk_user_id` ON `team_members` (`clerk_user_id`);--> statement-breakpoint
CREATE INDEX `idx_team_members_email` ON `team_members` (`email`);--> statement-breakpoint
CREATE INDEX `idx_team_members_team_id` ON `team_members` (`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_team_invitations_token` ON `team_invitations` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_team_invitations_pending` ON `team_invitations` (`team_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_team_invitations_status` ON `team_invitations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_team_invitations_email` ON `team_invitations` (`email`);--> statement-breakpoint
CREATE INDEX `idx_team_invitations_team_id` ON `team_invitations` (`team_id`);--> statement-breakpoint
CREATE INDEX `idx_task_comments_created_at` ON `task_comments` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_task_comments_author_id` ON `task_comments` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_task_comments_task_id` ON `task_comments` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_task_document_links_document_id` ON `task_document_links` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_task_document_links_task_id` ON `task_document_links` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_member_project_access_project` ON `member_project_access` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_member_project_access_member` ON `member_project_access` (`member_id`);
*/