CREATE TABLE IF NOT EXISTS "execution_processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"run_reason" text DEFAULT 'setupscript' NOT NULL,
	"executor_action" text DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"exit_code" integer,
	"dropped" boolean DEFAULT false NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dev_script" text,
	"remote_project_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"dev_script_working_dir" text DEFAULT '',
	"default_agent_working_dir" text DEFAULT '',
	"priority" integer DEFAULT 0,
	"lead_id" uuid,
	"start_date" timestamp,
	"target_date" timestamp,
	"status" text DEFAULT 'backlog',
	"health" integer DEFAULT 0,
	"description" text,
	"summary" text,
	"icon" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scratch" (
	"id" uuid NOT NULL,
	"scratch_type" text NOT NULL,
	"payload" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scratch_id_scratch_type_pk" PRIMARY KEY("id","scratch_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"executor" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"parent_workspace_id" uuid,
	"shared_task_id" uuid,
	"team_id" uuid,
	"priority" integer DEFAULT 0,
	"due_date" timestamp,
	"assignee_id" uuid,
	"issue_number" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'contributor' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"clerk_user_id" text,
	"avatar_url" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"identifier" text,
	"document_storage_path" text,
	"dev_script" text,
	"dev_script_working_dir" text,
	"default_agent_working_dir" text,
	"slug" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"setup_completed_at" timestamp,
	"container_ref" text,
	"branch" text DEFAULT 'main' NOT NULL,
	"agent_working_dir" text DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_processes_session_run_reason_created" ON "execution_processes" ("session_id","run_reason","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_processes_session_status_run_reason" ON "execution_processes" ("session_id","status","run_reason");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_processes_run_reason" ON "execution_processes" ("run_reason");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_processes_status" ON "execution_processes" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_processes_session_id" ON "execution_processes" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_target_date" ON "projects" ("target_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_status" ON "projects" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_lead_id" ON "projects" ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_priority" ON "projects" ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_created_at" ON "projects" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_projects_remote_project_id" ON "projects" ("remote_project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scratch_created_at" ON "scratch" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_workspace_id_created_at" ON "sessions" ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_workspace_id" ON "sessions" ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tasks_team_issue_unique" ON "tasks" ("team_id","issue_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_team_issue_number" ON "tasks" ("team_id","issue_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_priority" ON "tasks" ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_assignee_id" ON "tasks" ("assignee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_due_date" ON "tasks" ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_team_id" ON "tasks" ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tasks_shared_task_unique" ON "tasks" ("shared_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_project_created_at" ON "tasks" ("project_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_members_clerk_user_id" ON "team_members" ("clerk_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_members_email" ON "team_members" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_members_team_id" ON "team_members" ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_teams_slug" ON "teams" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspaces_container_ref" ON "workspaces" ("container_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_attempts_created_at" ON "workspaces" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_attempts_task_id_created_at" ON "workspaces" ("task_id","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "execution_processes" ADD CONSTRAINT "execution_processes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
