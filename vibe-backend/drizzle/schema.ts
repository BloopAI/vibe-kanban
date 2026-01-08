import { pgTable, index, foreignKey, pgEnum, uuid, text, integer, boolean, timestamp, uniqueIndex, primaryKey } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"

export const buckettype = pgEnum("buckettype", ['VECTOR', 'ANALYTICS', 'STANDARD'])
export const equalityOp = pgEnum("equality_op", ['in', 'gte', 'gt', 'lte', 'lt', 'neq', 'eq'])
export const action = pgEnum("action", ['ERROR', 'TRUNCATE', 'DELETE', 'UPDATE', 'INSERT'])
export const factorType = pgEnum("factor_type", ['phone', 'webauthn', 'totp'])
export const factorStatus = pgEnum("factor_status", ['verified', 'unverified'])
export const aalLevel = pgEnum("aal_level", ['aal3', 'aal2', 'aal1'])
export const codeChallengeMethod = pgEnum("code_challenge_method", ['plain', 's256'])
export const oneTimeTokenType = pgEnum("one_time_token_type", ['phone_change_token', 'email_change_token_current', 'email_change_token_new', 'recovery_token', 'reauthentication_token', 'confirmation_token'])
export const oauthRegistrationType = pgEnum("oauth_registration_type", ['manual', 'dynamic'])
export const oauthAuthorizationStatus = pgEnum("oauth_authorization_status", ['expired', 'denied', 'approved', 'pending'])
export const oauthResponseType = pgEnum("oauth_response_type", ['code'])
export const oauthClientType = pgEnum("oauth_client_type", ['confidential', 'public'])


export const executionProcesses = pgTable("execution_processes", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" } ),
	runReason: text("run_reason").default('setupscript').notNull(),
	executorAction: text("executor_action").default('{}').notNull(),
	status: text("status").default('running').notNull(),
	exitCode: integer("exit_code"),
	dropped: boolean("dropped").default(false).notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxExecutionProcessesSessionRunReasonCreated: index("idx_execution_processes_session_run_reason_created").on(table.createdAt, table.runReason, table.sessionId),
		idxExecutionProcessesSessionStatusRunReason: index("idx_execution_processes_session_status_run_reason").on(table.runReason, table.sessionId, table.status),
		idxExecutionProcessesRunReason: index("idx_execution_processes_run_reason").on(table.runReason),
		idxExecutionProcessesStatus: index("idx_execution_processes_status").on(table.status),
		idxExecutionProcessesSessionId: index("idx_execution_processes_session_id").on(table.sessionId),
	}
});

export const projects = pgTable("projects", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	name: text("name").notNull(),
	devScript: text("dev_script"),
	remoteProjectId: uuid("remote_project_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	devScriptWorkingDir: text("dev_script_working_dir").default(''),
	defaultAgentWorkingDir: text("default_agent_working_dir").default(''),
	priority: integer("priority").default(0),
	leadId: uuid("lead_id"),
	startDate: timestamp("start_date", { mode: 'string' }),
	targetDate: timestamp("target_date", { mode: 'string' }),
	status: text("status").default('backlog'),
	health: integer("health").default(0),
	description: text("description"),
	summary: text("summary"),
	icon: text("icon"),
},
(table) => {
	return {
		idxProjectsTargetDate: index("idx_projects_target_date").on(table.targetDate),
		idxProjectsStatus: index("idx_projects_status").on(table.status),
		idxProjectsLeadId: index("idx_projects_lead_id").on(table.leadId),
		idxProjectsPriority: index("idx_projects_priority").on(table.priority),
		idxProjectsCreatedAt: index("idx_projects_created_at").on(table.createdAt),
		idxProjectsRemoteProjectId: uniqueIndex("idx_projects_remote_project_id").on(table.remoteProjectId),
	}
});

export const repos = pgTable("repos", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	path: text("path").notNull(),
	name: text("name").notNull(),
	displayName: text("display_name").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" } ),
	executor: text("executor"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxSessionsWorkspaceIdCreatedAt: index("idx_sessions_workspace_id_created_at").on(table.createdAt, table.workspaceId),
		idxSessionsWorkspaceId: index("idx_sessions_workspace_id").on(table.workspaceId),
	}
});

export const tasks = pgTable("tasks", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	title: text("title").notNull(),
	description: text("description"),
	status: text("status").default('todo').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	parentWorkspaceId: uuid("parent_workspace_id"),
	sharedTaskId: uuid("shared_task_id"),
	teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" } ),
	priority: integer("priority").default(0),
	dueDate: timestamp("due_date", { mode: 'string' }),
	assigneeId: uuid("assignee_id"),
	issueNumber: integer("issue_number"),
},
(table) => {
	return {
		idxTasksTeamIssueUnique: uniqueIndex("idx_tasks_team_issue_unique").on(table.issueNumber, table.teamId),
		idxTasksTeamIssueNumber: index("idx_tasks_team_issue_number").on(table.issueNumber, table.teamId),
		idxTasksPriority: index("idx_tasks_priority").on(table.priority),
		idxTasksAssigneeId: index("idx_tasks_assignee_id").on(table.assigneeId),
		idxTasksDueDate: index("idx_tasks_due_date").on(table.dueDate),
		idxTasksTeamId: index("idx_tasks_team_id").on(table.teamId),
		idxTasksSharedTaskUnique: uniqueIndex("idx_tasks_shared_task_unique").on(table.sharedTaskId),
		idxTasksProjectCreatedAt: index("idx_tasks_project_created_at").on(table.createdAt, table.projectId),
	}
});

export const teamMembers = pgTable("team_members", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	email: text("email").notNull(),
	displayName: text("display_name"),
	role: text("role").default('contributor').notNull(),
	invitedBy: uuid("invited_by"),
	joinedAt: timestamp("joined_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	clerkUserId: text("clerk_user_id"),
	avatarUrl: text("avatar_url"),
},
(table) => {
	return {
		idxTeamMembersEmail: index("idx_team_members_email").on(table.email),
		idxTeamMembersTeamId: index("idx_team_members_team_id").on(table.teamId),
		idxTeamMembersClerkUserId: index("idx_team_members_clerk_user_id").on(table.clerkUserId),
	}
});

export const teams = pgTable("teams", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	name: text("name").notNull(),
	icon: text("icon"),
	color: text("color"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	identifier: text("identifier"),
	documentStoragePath: text("document_storage_path"),
	devScript: text("dev_script"),
	devScriptWorkingDir: text("dev_script_working_dir"),
	defaultAgentWorkingDir: text("default_agent_working_dir"),
	slug: text("slug"),
},
(table) => {
	return {
		idxTeamsSlug: uniqueIndex("idx_teams_slug").on(table.slug),
	}
});

export const workspaces = pgTable("workspaces", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" } ),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	setupCompletedAt: timestamp("setup_completed_at", { mode: 'string' }),
	containerRef: text("container_ref"),
	branch: text("branch").default('main').notNull(),
	agentWorkingDir: text("agent_working_dir").default(''),
},
(table) => {
	return {
		idxWorkspacesContainerRef: index("idx_workspaces_container_ref").on(table.containerRef),
		idxTaskAttemptsCreatedAt: index("idx_task_attempts_created_at").on(table.createdAt),
		idxTaskAttemptsTaskIdCreatedAt: index("idx_task_attempts_task_id_created_at").on(table.createdAt, table.taskId),
	}
});

export const scratch = pgTable("scratch", {
	id: uuid("id").notNull(),
	scratchType: text("scratch_type").notNull(),
	payload: text("payload").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		idxScratchCreatedAt: index("idx_scratch_created_at").on(table.createdAt),
		scratchIdScratchTypePk: primaryKey({ columns: [table.id, table.scratchType], name: "scratch_id_scratch_type_pk"})
	}
});