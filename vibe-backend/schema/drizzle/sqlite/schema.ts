import { sqliteTable, AnySQLiteColumn, integer, text, numeric, blob, uniqueIndex, index, foreignKey, primaryKey } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const sqlxMigrations = sqliteTable("_sqlx_migrations", {
	version: integer("version").primaryKey(),
	description: text("description").notNull(),
	installedOn: numeric("installed_on").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	success: numeric("success").notNull(),
	checksum: blob("checksum").notNull(),
	executionTime: integer("execution_time").notNull(),
});

export const tasks = sqliteTable("tasks", {
	id: blob("id").primaryKey(),
	projectId: blob("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	title: text("title").notNull(),
	description: text("description"),
	status: text("status").default("todo").notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	parentWorkspaceId: blob("parent_workspace_id").references((): AnySQLiteColumn => workspaces.id),
	sharedTaskId: blob("shared_task_id"),
	teamId: blob("team_id").references(() => teams.id, { onDelete: "set null" } ),
	priority: integer("priority").default(0),
	dueDate: text("due_date"),
	assigneeId: blob("assignee_id"),
	issueNumber: integer("issue_number"),
},
(table) => {
	return {
		idxTasksTeamIssueUnique: uniqueIndex("idx_tasks_team_issue_unique").on(table.teamId, table.issueNumber),
		idxTasksTeamIssueNumber: index("idx_tasks_team_issue_number").on(table.teamId, table.issueNumber),
		idxTasksPriority: index("idx_tasks_priority").on(table.priority),
		idxTasksAssigneeId: index("idx_tasks_assignee_id").on(table.assigneeId),
		idxTasksDueDate: index("idx_tasks_due_date").on(table.dueDate),
		idxTasksTeamId: index("idx_tasks_team_id").on(table.teamId),
		idxTasksParentWorkspaceId: index("idx_tasks_parent_workspace_id").on(table.parentWorkspaceId),
		idxTasksSharedTaskUnique: uniqueIndex("idx_tasks_shared_task_unique").on(table.sharedTaskId),
		idxTasksProjectCreatedAt: index("idx_tasks_project_created_at").on(table.projectId, table.createdAt),
	}
});

export const workspaces = sqliteTable("workspaces", {
	id: blob("id").primaryKey(),
	taskId: blob("task_id").notNull().references((): AnySQLiteColumn => tasks.id, { onDelete: "cascade" } ),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	setupCompletedAt: numeric("setup_completed_at"),
	containerRef: text("container_ref"),
	branch: text("branch").default("main").notNull(),
	agentWorkingDir: text("agent_working_dir").default(""),
},
(table) => {
	return {
		idxWorkspacesContainerRef: index("idx_workspaces_container_ref").on(table.containerRef),
		idxTaskAttemptsCreatedAt: index("idx_task_attempts_created_at").on(table.createdAt),
		idxTaskAttemptsTaskIdCreatedAt: index("idx_task_attempts_task_id_created_at").on(table.taskId, table.createdAt),
	}
});

export const images = sqliteTable("images", {
	id: blob("id").primaryKey(),
	filePath: text("file_path").notNull(),
	originalName: text("original_name").notNull(),
	mimeType: text("mime_type"),
	sizeBytes: integer("size_bytes"),
	hash: text("hash").notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxImagesHash: index("idx_images_hash").on(table.hash),
	}
});

export const taskImages = sqliteTable("task_images", {
	id: blob("id").primaryKey(),
	taskId: blob("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" } ),
	imageId: blob("image_id").notNull().references(() => images.id, { onDelete: "cascade" } ),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxTaskImagesImageId: index("idx_task_images_image_id").on(table.imageId),
		idxTaskImagesTaskId: index("idx_task_images_task_id").on(table.taskId),
	}
});

export const merges = sqliteTable("merges", {
	id: blob("id").primaryKey(),
	workspaceId: blob("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" } ),
	mergeType: text("merge_type").notNull(),
	mergeCommit: text("merge_commit"),
	prNumber: integer("pr_number"),
	prUrl: text("pr_url"),
	prStatus: text("pr_status"),
	prMergedAt: text("pr_merged_at"),
	prMergeCommitSha: text("pr_merge_commit_sha"),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	targetBranchName: text("target_branch_name").notNull(),
	repoId: blob("repo_id").default(sql`(X'00')`).notNull(),
},
(table) => {
	return {
		idxMergesOpenPr: index("idx_merges_open_pr").on(table.workspaceId, table.prStatus),
		idxMergesWorkspaceId: index("idx_merges_workspace_id").on(table.workspaceId),
		idxMergesRepoId: index("idx_merges_repo_id").on(table.repoId),
	}
});

export const tags = sqliteTable("tags", {
	id: blob("id").primaryKey(),
	tagName: text("tag_name").notNull(),
	content: text("content").notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
});

export const executionProcessLogs = sqliteTable("execution_process_logs", {
	executionId: blob("execution_id").notNull().references(() => executionProcesses.id, { onDelete: "cascade" } ),
	logs: text("logs").notNull(),
	byteSize: integer("byte_size").notNull(),
	insertedAt: text("inserted_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxExecutionProcessLogsExecutionIdInsertedAt: index("idx_execution_process_logs_execution_id_inserted_at").on(table.executionId, table.insertedAt),
	}
});

export const scratch = sqliteTable("scratch", {
	id: blob("id").notNull(),
	scratchType: text("scratch_type").notNull(),
	payload: text("payload").notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxScratchCreatedAt: index("idx_scratch_created_at").on(table.createdAt),
		pk0: primaryKey({ columns: [table.id, table.scratchType], name: "scratch_id_scratch_type_pk"})
	}
});

export const repos = sqliteTable("repos", {
	id: blob("id").primaryKey(),
	path: text("path").notNull(),
	name: text("name").notNull(),
	displayName: text("display_name").notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
});

export const projectRepos = sqliteTable("project_repos", {
	id: blob("id").primaryKey(),
	projectId: blob("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	repoId: blob("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" } ),
	setupScript: text("setup_script"),
	cleanupScript: text("cleanup_script"),
	copyFiles: text("copy_files"),
	parallelSetupScript: integer("parallel_setup_script").default(0).notNull(),
},
(table) => {
	return {
		idxProjectReposRepoId: index("idx_project_repos_repo_id").on(table.repoId),
		idxProjectReposProjectId: index("idx_project_repos_project_id").on(table.projectId),
	}
});

export const workspaceRepos = sqliteTable("workspace_repos", {
	id: blob("id").primaryKey(),
	workspaceId: blob("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" } ),
	repoId: blob("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" } ),
	targetBranch: text("target_branch").notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxWorkspaceReposRepoId: index("idx_workspace_repos_repo_id").on(table.repoId),
		idxWorkspaceReposWorkspaceId: index("idx_workspace_repos_workspace_id").on(table.workspaceId),
	}
});

export const executionProcessRepoStates = sqliteTable("execution_process_repo_states", {
	id: blob("id").primaryKey(),
	executionProcessId: blob("execution_process_id").notNull().references(() => executionProcesses.id, { onDelete: "cascade" } ),
	repoId: blob("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" } ),
	beforeHeadCommit: text("before_head_commit"),
	afterHeadCommit: text("after_head_commit"),
	mergeCommit: text("merge_commit"),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxEprsProcessRepo: index("idx_eprs_process_repo").on(table.executionProcessId, table.repoId),
		idxEprsRepoId: index("idx_eprs_repo_id").on(table.repoId),
		idxEprsProcessId: index("idx_eprs_process_id").on(table.executionProcessId),
	}
});

export const projects = sqliteTable("projects", {
	id: blob("id").primaryKey(),
	name: text("name").notNull(),
	devScript: text("dev_script"),
	remoteProjectId: blob("remote_project_id"),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	devScriptWorkingDir: text("dev_script_working_dir").default(""),
	defaultAgentWorkingDir: text("default_agent_working_dir").default(""),
	priority: integer("priority").default(0),
	leadId: blob("lead_id"),
	startDate: text("start_date"),
	targetDate: text("target_date"),
	status: text("status").default("backlog"),
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

export const sessions = sqliteTable("sessions", {
	id: blob("id").primaryKey(),
	workspaceId: blob("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" } ),
	executor: text("executor"),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxSessionsWorkspaceIdCreatedAt: index("idx_sessions_workspace_id_created_at").on(table.workspaceId, table.createdAt),
		idxSessionsWorkspaceId: index("idx_sessions_workspace_id").on(table.workspaceId),
	}
});

export const executionProcesses = sqliteTable("execution_processes", {
	id: blob("id").primaryKey(),
	sessionId: blob("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" } ),
	runReason: text("run_reason").default("setupscript").notNull(),
	executorAction: text("executor_action").default("{}").notNull(),
	status: text("status").default("running").notNull(),
	exitCode: integer("exit_code"),
	dropped: integer("dropped").default(0).notNull(),
	startedAt: text("started_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	completedAt: text("completed_at"),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxExecutionProcessesSessionRunReasonCreated: index("idx_execution_processes_session_run_reason_created").on(table.sessionId, table.runReason, table.createdAt),
		idxExecutionProcessesSessionStatusRunReason: index("idx_execution_processes_session_status_run_reason").on(table.sessionId, table.status, table.runReason),
		idxExecutionProcessesRunReason: index("idx_execution_processes_run_reason").on(table.runReason),
		idxExecutionProcessesStatus: index("idx_execution_processes_status").on(table.status),
		idxExecutionProcessesSessionId: index("idx_execution_processes_session_id").on(table.sessionId),
	}
});

export const codingAgentTurns = sqliteTable("coding_agent_turns", {
	id: blob("id").primaryKey(),
	executionProcessId: blob("execution_process_id").notNull().references(() => executionProcesses.id, { onDelete: "cascade" } ),
	agentSessionId: text("agent_session_id"),
	prompt: text("prompt"),
	summary: text("summary"),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxCodingAgentTurnsAgentSessionId: index("idx_coding_agent_turns_agent_session_id").on(table.agentSessionId),
		idxCodingAgentTurnsExecutionProcessId: index("idx_coding_agent_turns_execution_process_id").on(table.executionProcessId),
	}
});

export const sqliteStat4 = sqliteTable("sqlite_stat4", {
	tbl: text("tbl"),
	idx: text("idx"),
	neq: text("neq"),
	nlt: text("nlt"),
	ndlt: text("ndlt"),
	sample: text("sample"),
});

export const teams = sqliteTable("teams", {
	id: blob("id").primaryKey(),
	name: text("name").notNull(),
	icon: text("icon"),
	color: text("color"),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
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

export const teamProjects = sqliteTable("team_projects", {
	teamId: blob("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	projectId: blob("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxTeamProjectsProjectId: index("idx_team_projects_project_id").on(table.projectId),
		idxTeamProjectsTeamId: index("idx_team_projects_team_id").on(table.teamId),
		pk0: primaryKey({ columns: [table.projectId, table.teamId], name: "team_projects_project_id_team_id_pk"})
	}
});

export const milestones = sqliteTable("milestones", {
	id: blob("id").primaryKey().notNull(),
	projectId: blob("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	name: text("name").notNull(),
	description: text("description"),
	targetDate: text("target_date"),
	sortOrder: integer("sort_order").default(0),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updatedAt: numeric("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => {
	return {
		idxMilestonesProjectId: index("idx_milestones_project_id").on(table.projectId),
	}
});

export const projectDependencies = sqliteTable("project_dependencies", {
	id: blob("id").primaryKey().notNull(),
	projectId: blob("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	dependsOnProjectId: blob("depends_on_project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	dependencyType: text("dependency_type").notNull(),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => {
	return {
		idxProjectDependenciesDependsOn: index("idx_project_dependencies_depends_on").on(table.dependsOnProjectId),
		idxProjectDependenciesProjectId: index("idx_project_dependencies_project_id").on(table.projectId),
	}
});

export const projectLabels = sqliteTable("project_labels", {
	id: blob("id").primaryKey().notNull(),
	name: text("name").notNull(),
	color: text("color"),
	createdAt: numeric("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const projectLabelAssignments = sqliteTable("project_label_assignments", {
	projectId: blob("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	labelId: blob("label_id").notNull().references(() => projectLabels.id, { onDelete: "cascade" } ),
},
(table) => {
	return {
		idxProjectLabelAssignmentsLabel: index("idx_project_label_assignments_label").on(table.labelId),
		idxProjectLabelAssignmentsProject: index("idx_project_label_assignments_project").on(table.projectId),
		pk0: primaryKey({ columns: [table.labelId, table.projectId], name: "project_label_assignments_label_id_project_id_pk"})
	}
});

export const inboxItems = sqliteTable("inbox_items", {
	id: blob("id").primaryKey(),
	notificationType: text("notification_type").default("task_assigned").notNull(),
	title: text("title").notNull(),
	message: text("message"),
	taskId: blob("task_id").references(() => tasks.id, { onDelete: "set null" } ),
	projectId: blob("project_id").references(() => projects.id, { onDelete: "set null" } ),
	workspaceId: blob("workspace_id").references(() => workspaces.id, { onDelete: "set null" } ),
	isRead: integer("is_read").default(0).notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxInboxItemsCreatedAt: index("idx_inbox_items_created_at").on(table.createdAt),
		idxInboxItemsWorkspaceId: index("idx_inbox_items_workspace_id").on(table.workspaceId),
		idxInboxItemsProjectId: index("idx_inbox_items_project_id").on(table.projectId),
		idxInboxItemsTaskId: index("idx_inbox_items_task_id").on(table.taskId),
		idxInboxItemsIsRead: index("idx_inbox_items_is_read").on(table.isRead),
	}
});

export const documentFolders = sqliteTable("document_folders", {
	id: blob("id").primaryKey(),
	teamId: blob("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	parentId: blob("parent_id"),
	name: text("name").notNull(),
	icon: text("icon"),
	color: text("color"),
	position: integer("position").default(0).notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	localPath: text("local_path"),
},
(table) => {
	return {
		idxDocumentFoldersParentId: index("idx_document_folders_parent_id").on(table.parentId),
		idxDocumentFoldersTeamId: index("idx_document_folders_team_id").on(table.teamId),
		documentFoldersParentIdDocumentFoldersIdFk: foreignKey(() => ({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "document_folders_parent_id_document_folders_id_fk"
		})).onDelete("cascade"),
	}
});

export const documents = sqliteTable("documents", {
	id: blob("id").primaryKey(),
	teamId: blob("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	folderId: blob("folder_id").references(() => documentFolders.id, { onDelete: "set null" } ),
	title: text("title").notNull(),
	content: text("content"),
	filePath: text("file_path"),
	fileType: text("file_type").default("markdown").notNull(),
	fileSize: integer("file_size"),
	mimeType: text("mime_type"),
	icon: text("icon"),
	isPinned: numeric("is_pinned").default(sql`(FALSE)`).notNull(),
	isArchived: numeric("is_archived").default(sql`(FALSE)`).notNull(),
	position: integer("position").default(0).notNull(),
	createdBy: text("created_by"),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	slug: text("slug"),
},
(table) => {
	return {
		idxDocumentsTeamSlug: index("idx_documents_team_slug").on(table.teamId, table.slug),
		idxDocumentsIsArchived: index("idx_documents_is_archived").on(table.isArchived),
		idxDocumentsIsPinned: index("idx_documents_is_pinned").on(table.isPinned),
		idxDocumentsFileType: index("idx_documents_file_type").on(table.fileType),
		idxDocumentsFolderId: index("idx_documents_folder_id").on(table.folderId),
		idxDocumentsTeamId: index("idx_documents_team_id").on(table.teamId),
	}
});

export const githubRepositories = sqliteTable("github_repositories", {
	id: blob("id").primaryKey(),
	connectionId: blob("connection_id").notNull().references(() => githubConnections.id, { onDelete: "cascade" } ),
	repoFullName: text("repo_full_name").notNull(),
	repoName: text("repo_name").notNull(),
	repoOwner: text("repo_owner").notNull(),
	repoUrl: text("repo_url").notNull(),
	defaultBranch: text("default_branch"),
	isPrivate: integer("is_private").default(0).notNull(),
	linkedAt: text("linked_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	syncPath: text("sync_path"),
	syncFolderId: text("sync_folder_id"),
	lastSyncedAt: numeric("last_synced_at"),
},
(table) => {
	return {
		idxGithubRepositoriesSyncFolderId: index("idx_github_repositories_sync_folder_id").on(table.syncFolderId),
		idxGithubRepositoriesUnique: uniqueIndex("idx_github_repositories_unique").on(table.connectionId, table.repoFullName),
		idxGithubRepositoriesConnectionId: index("idx_github_repositories_connection_id").on(table.connectionId),
	}
});

export const githubRepoSyncConfigs = sqliteTable("github_repo_sync_configs", {
	id: blob("id").primaryKey().notNull(),
	repoId: blob("repo_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" } ),
	folderId: text("folder_id").notNull(),
	githubPath: text("github_path"),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxSyncConfigsFolder: index("idx_sync_configs_folder").on(table.folderId),
		idxSyncConfigsRepo: index("idx_sync_configs_repo").on(table.repoId),
	}
});

export const teamRepos = sqliteTable("team_repos", {
	id: blob("id").primaryKey(),
	teamId: blob("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	repoId: blob("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" } ),
	setupScript: text("setup_script"),
	cleanupScript: text("cleanup_script"),
	copyFiles: text("copy_files"),
	parallelSetupScript: integer("parallel_setup_script").default(0).notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxTeamReposRepoId: index("idx_team_repos_repo_id").on(table.repoId),
		idxTeamReposTeamId: index("idx_team_repos_team_id").on(table.teamId),
	}
});

export const githubConnections = sqliteTable("github_connections", {
	id: blob("id").primaryKey(),
	teamId: blob("team_id").references(() => teams.id, { onDelete: "cascade" } ),
	accessToken: text("access_token").notNull(),
	githubUsername: text("github_username"),
	connectedAt: text("connected_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxGithubConnectionsWorkspace: uniqueIndex("idx_github_connections_workspace").on(table.teamId),
		idxGithubConnectionsTeamId: index("idx_github_connections_team_id").on(table.teamId),
	}
});

export const teamMembers = sqliteTable("team_members", {
	id: blob("id").primaryKey(),
	teamId: blob("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	email: text("email").notNull(),
	displayName: text("display_name"),
	role: text("role").default("contributor").notNull(),
	invitedBy: blob("invited_by"),
	joinedAt: text("joined_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	updatedAt: text("updated_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	clerkUserId: text("clerk_user_id"),
	avatarUrl: text("avatar_url"),
},
(table) => {
	return {
		idxTeamMembersClerkUserId: index("idx_team_members_clerk_user_id").on(table.clerkUserId),
		idxTeamMembersEmail: index("idx_team_members_email").on(table.email),
		idxTeamMembersTeamId: index("idx_team_members_team_id").on(table.teamId),
	}
});

export const teamInvitations = sqliteTable("team_invitations", {
	id: blob("id").primaryKey(),
	teamId: blob("team_id").notNull().references(() => teams.id, { onDelete: "cascade" } ),
	email: text("email").notNull(),
	role: text("role").default("contributor").notNull(),
	status: text("status").default("pending").notNull(),
	invitedBy: blob("invited_by"),
	expiresAt: text("expires_at").notNull(),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
	token: text("token"),
},
(table) => {
	return {
		idxTeamInvitationsToken: uniqueIndex("idx_team_invitations_token").on(table.token),
		idxTeamInvitationsPending: uniqueIndex("idx_team_invitations_pending").on(table.teamId, table.email),
		idxTeamInvitationsStatus: index("idx_team_invitations_status").on(table.status),
		idxTeamInvitationsEmail: index("idx_team_invitations_email").on(table.email),
		idxTeamInvitationsTeamId: index("idx_team_invitations_team_id").on(table.teamId),
	}
});

export const taskComments = sqliteTable("task_comments", {
	id: text("id").primaryKey().notNull(),
	taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" } ),
	authorId: text("author_id").references(() => teamMembers.id, { onDelete: "set null" } ),
	authorName: text("author_name").notNull(),
	authorEmail: text("author_email"),
	content: text("content").notNull(),
	isInternal: numeric("is_internal").default(sql`(FALSE)`).notNull(),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
},
(table) => {
	return {
		idxTaskCommentsCreatedAt: index("idx_task_comments_created_at").on(table.taskId, table.createdAt),
		idxTaskCommentsAuthorId: index("idx_task_comments_author_id").on(table.authorId),
		idxTaskCommentsTaskId: index("idx_task_comments_task_id").on(table.taskId),
	}
});

export const taskDocumentLinks = sqliteTable("task_document_links", {
	id: text("id").primaryKey().notNull(),
	taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" } ),
	documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" } ),
	createdAt: text("created_at").notNull(),
},
(table) => {
	return {
		idxTaskDocumentLinksDocumentId: index("idx_task_document_links_document_id").on(table.documentId),
		idxTaskDocumentLinksTaskId: index("idx_task_document_links_task_id").on(table.taskId),
	}
});

export const memberProjectAccess = sqliteTable("member_project_access", {
	id: text("id").primaryKey().notNull(),
	memberId: text("member_id").notNull().references(() => teamMembers.id, { onDelete: "cascade" } ),
	projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" } ),
	createdAt: text("created_at").default("sql`(datetime('now', 'subsec'))`").notNull(),
},
(table) => {
	return {
		idxMemberProjectAccessProject: index("idx_member_project_access_project").on(table.projectId),
		idxMemberProjectAccessMember: index("idx_member_project_access_member").on(table.memberId),
	}
});