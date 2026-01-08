import { pgTable, text, integer, bigint, boolean, timestamp, uuid, index, uniqueIndex, foreignKey, numeric, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Projects Table
export const projects = pgTable("projects", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id"),
    name: text("name").notNull(),
    metadata: text("metadata").default("{}"),
    devScript: text("dev_script"),
    remoteProjectId: uuid("remote_project_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    devScriptWorkingDir: text("dev_script_working_dir").default(""),
    defaultAgentWorkingDir: text("default_agent_working_dir").default(""),
    priority: integer("priority").default(0),
    leadId: uuid("lead_id"),
    startDate: timestamp("start_date", { withTimezone: true }),
    targetDate: timestamp("target_date", { withTimezone: true }),
    status: text("status").default("backlog"),
    health: integer("health").default(0),
    description: text("description"),
    summary: text("summary"),
    icon: text("icon"),
}, (table) => ({
    idxProjectsTargetDate: index("idx_projects_target_date").on(table.targetDate),
    idxProjectsStatus: index("idx_projects_status").on(table.status),
    idxProjectsLeadId: index("idx_projects_lead_id").on(table.leadId),
    idxProjectsPriority: index("idx_projects_priority").on(table.priority),
    idxProjectsCreatedAt: index("idx_projects_created_at").on(table.createdAt),
    idxProjectsRemoteProjectId: uniqueIndex("idx_projects_remote_project_id").on(table.remoteProjectId),
}));

// Teams Table
export const teams = pgTable("teams", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    identifier: text("identifier"),
    documentStoragePath: text("document_storage_path"),
    devScript: text("dev_script"),
    devScriptWorkingDir: text("dev_script_working_dir"),
    defaultAgentWorkingDir: text("default_agent_working_dir"),
    slug: text("slug"),
}, (table) => ({
    idxTeamsSlug: uniqueIndex("idx_teams_slug").on(table.slug),
}));

// Tasks Table
export const tasks = pgTable("tasks", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").default("todo").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    parentWorkspaceId: uuid("parent_workspace_id"), // References workspaces defined below
    sharedTaskId: uuid("shared_task_id"),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    priority: integer("priority").default(0),
    dueDate: timestamp("due_date", { withTimezone: true }),
    assigneeId: uuid("assignee_id"),
    issueNumber: integer("issue_number"),
}, (table) => ({
    idxTasksTeamIssueUnique: uniqueIndex("idx_tasks_team_issue_unique").on(table.teamId, table.issueNumber),
    idxTasksTeamIssueNumber: index("idx_tasks_team_issue_number").on(table.teamId, table.issueNumber),
    idxTasksPriority: index("idx_tasks_priority").on(table.priority),
    idxTasksAssigneeId: index("idx_tasks_assignee_id").on(table.assigneeId),
    idxTasksDueDate: index("idx_tasks_due_date").on(table.dueDate),
    idxTasksTeamId: index("idx_tasks_team_id").on(table.teamId),
    // idxTasksParentWorkspaceId: index("idx_tasks_parent_workspace_id").on(table.parentWorkspaceId), // Circular ref handling
    idxTasksSharedTaskUnique: uniqueIndex("idx_tasks_shared_task_unique").on(table.sharedTaskId),
    idxTasksProjectCreatedAt: index("idx_tasks_project_created_at").on(table.projectId, table.createdAt),
}));

// Workspaces
export const workspaces = pgTable("workspaces", {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    containerRef: text("container_ref"),
    branch: text("branch").default("main").notNull(),
    agentWorkingDir: text("agent_working_dir").default(""),
}, (table) => ({
    idxWorkspacesContainerRef: index("idx_workspaces_container_ref").on(table.containerRef),
    idxTaskAttemptsCreatedAt: index("idx_task_attempts_created_at").on(table.createdAt),
    idxTaskAttemptsTaskIdCreatedAt: index("idx_task_attempts_task_id_created_at").on(table.taskId, table.createdAt),
}));

// Team Members
export const teamMembers = pgTable("team_members", {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name"),
    role: text("role").default("contributor").notNull(),
    invitedBy: uuid("invited_by"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    clerkUserId: text("clerk_user_id"),
    avatarUrl: text("avatar_url"),
}, (table) => ({
    idxTeamMembersClerkUserId: index("idx_team_members_clerk_user_id").on(table.clerkUserId),
    idxTeamMembersEmail: index("idx_team_members_email").on(table.email),
    idxTeamMembersTeamId: index("idx_team_members_team_id").on(table.teamId),
}));

// Sessions
export const sessions = pgTable("sessions", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    executor: text("executor"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxSessionsWorkspaceIdCreatedAt: index("idx_sessions_workspace_id_created_at").on(table.workspaceId, table.createdAt),
    idxSessionsWorkspaceId: index("idx_sessions_workspace_id").on(table.workspaceId),
}));

// Execution Processes
export const executionProcesses = pgTable("execution_processes", {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    runReason: text("run_reason").default("setupscript").notNull(),
    executorAction: text("executor_action").default("{}").notNull(),
    status: text("status").default("running").notNull(),
    exitCode: integer("exit_code"),
    dropped: boolean("dropped").default(false).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxExecutionProcessesSessionRunReasonCreated: index("idx_execution_processes_session_run_reason_created").on(table.sessionId, table.runReason, table.createdAt),
    idxExecutionProcessesSessionStatusRunReason: index("idx_execution_processes_session_status_run_reason").on(table.sessionId, table.status, table.runReason),
    idxExecutionProcessesRunReason: index("idx_execution_processes_run_reason").on(table.runReason),
    idxExecutionProcessesStatus: index("idx_execution_processes_status").on(table.status),
    idxExecutionProcessesSessionId: index("idx_execution_processes_session_id").on(table.sessionId),
}));

// Repos
export const repos = pgTable("repos", {
    id: uuid("id").primaryKey().defaultRandom(),
    path: text("path").notNull(),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxReposPath: uniqueIndex("idx_repos_path").on(table.path),
}));

// Scratch
export const scratch = pgTable("scratch", {
    id: uuid("id").notNull(),
    scratchType: text("scratch_type").notNull(),
    payload: text("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxScratchCreatedAt: index("idx_scratch_created_at").on(table.createdAt),
    pk0: primaryKey({ columns: [table.id, table.scratchType], name: "scratch_id_scratch_type_pk" })
}));

// Document Folders
export const documentFolders = pgTable("document_folders", {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    localPath: text("local_path"),
}, (table) => ({
    idxDocumentFoldersParentId: index("idx_document_folders_parent_id").on(table.parentId),
    idxDocumentFoldersTeamId: index("idx_document_folders_team_id").on(table.teamId),
    documentFoldersParentIdDocumentFoldersIdFk: foreignKey({
        columns: [table.parentId],
        foreignColumns: [table.id],
        name: "document_folders_parent_id_document_folders_id_fk"
    }).onDelete("cascade"),
}));

// Documents
export const documents = pgTable("documents", {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => documentFolders.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    content: text("content"),
    filePath: text("file_path"),
    fileType: text("file_type").default("markdown").notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    mimeType: text("mime_type"),
    icon: text("icon"),
    isPinned: boolean("is_pinned").default(false).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    slug: text("slug"),
}, (table) => ({
    idxDocumentsTeamSlug: index("idx_documents_team_slug").on(table.teamId, table.slug),
    idxDocumentsIsArchived: index("idx_documents_is_archived").on(table.isArchived),
    idxDocumentsIsPinned: index("idx_documents_is_pinned").on(table.isPinned),
    idxDocumentsFileType: index("idx_documents_file_type").on(table.fileType),
    idxDocumentsFolderId: index("idx_documents_folder_id").on(table.folderId),
    idxDocumentsTeamId: index("idx_documents_team_id").on(table.teamId),
}));

// GitHub Connections
export const githubConnections = pgTable("github_connections", {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    accessToken: text("access_token").notNull(),
    githubUsername: text("github_username"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxGithubConnectionsWorkspace: uniqueIndex("idx_github_connections_workspace").on(table.teamId),
    idxGithubConnectionsTeamId: index("idx_github_connections_team_id").on(table.teamId),
}));

// GitHub Repositories
export const githubRepositories = pgTable("github_repositories", {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => githubConnections.id, { onDelete: "cascade" }),
    repoFullName: text("repo_full_name").notNull(),
    repoName: text("repo_name").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoUrl: text("repo_url").notNull(),
    defaultBranch: text("default_branch"),
    isPrivate: boolean("is_private").default(false).notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
    syncPath: text("sync_path"),
    syncFolderId: text("sync_folder_id"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
}, (table) => ({
    idxGithubRepositoriesSyncFolderId: index("idx_github_repositories_sync_folder_id").on(table.syncFolderId),
    idxGithubRepositoriesUnique: uniqueIndex("idx_github_repositories_unique").on(table.connectionId, table.repoFullName),
    idxGithubRepositoriesConnectionId: index("idx_github_repositories_connection_id").on(table.connectionId),
}));

// GitHub Repo Sync Configs
export const githubRepoSyncConfigs = pgTable("github_repo_sync_configs", {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id").notNull().references(() => githubRepositories.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull(),
    githubPath: text("github_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxSyncConfigsFolder: index("idx_sync_configs_folder").on(table.folderId),
    idxSyncConfigsRepo: index("idx_sync_configs_repo").on(table.repoId),
    idxGithubRepoSyncConfigsUnique: uniqueIndex("idx_github_repo_sync_configs_unique").on(table.repoId, table.folderId),
}));

// Project Repos
export const projectRepos = pgTable("project_repos", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
    setupScript: text("setup_script"),
    cleanupScript: text("cleanup_script"),
    copyFiles: text("copy_files"),
    parallelSetupScript: boolean("parallel_setup_script").default(false).notNull(),
}, (table) => ({
    idxProjectReposRepoId: index("idx_project_repos_repo_id").on(table.repoId),
    idxProjectReposProjectId: index("idx_project_repos_project_id").on(table.projectId),
}));

// Workspace Repos
export const workspaceRepos = pgTable("workspace_repos", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
    targetBranch: text("target_branch").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxWorkspaceReposRepoId: index("idx_workspace_repos_repo_id").on(table.repoId),
    idxWorkspaceReposWorkspaceId: index("idx_workspace_repos_workspace_id").on(table.workspaceId),
}));

// Team Repos
export const teamRepos = pgTable("team_repos", {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
    setupScript: text("setup_script"),
    cleanupScript: text("cleanup_script"),
    copyFiles: text("copy_files"),
    parallelSetupScript: boolean("parallel_setup_script").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxTeamReposRepoId: index("idx_team_repos_repo_id").on(table.repoId),
    idxTeamReposTeamId: index("idx_team_repos_team_id").on(table.teamId),
}));

// Execution Process Repo States
export const executionProcessRepoStates = pgTable("execution_process_repo_states", {
    id: uuid("id").primaryKey().defaultRandom(),
    executionProcessId: uuid("execution_process_id").notNull().references(() => executionProcesses.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").notNull().references(() => repos.id, { onDelete: "cascade" }),
    beforeHeadCommit: text("before_head_commit"),
    afterHeadCommit: text("after_head_commit"),
    mergeCommit: text("merge_commit"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxEprsProcessRepo: index("idx_eprs_process_repo").on(table.executionProcessId, table.repoId),
    idxEprsRepoId: index("idx_eprs_repo_id").on(table.repoId),
    idxEprsProcessId: index("idx_eprs_process_id").on(table.executionProcessId),
}));

// Images
export const images = pgTable("images", {
    id: uuid("id").primaryKey().defaultRandom(),
    filePath: text("file_path").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxImagesHash: index("idx_images_hash").on(table.hash),
}));

// Task Images
export const taskImages = pgTable("task_images", {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    imageId: uuid("image_id").notNull().references(() => images.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxTaskImagesImageId: index("idx_task_images_image_id").on(table.imageId),
    idxTaskImagesTaskId: index("idx_task_images_task_id").on(table.taskId),
}));

// Merges
export const merges = pgTable("merges", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    mergeType: text("merge_type").notNull(),
    mergeCommit: text("merge_commit"),
    prNumber: bigint("pr_number", { mode: "number" }),
    prUrl: text("pr_url"),
    prStatus: text("pr_status"),
    prMergedAt: timestamp("pr_merged_at", { withTimezone: true }),
    prMergeCommitSha: text("pr_merge_commit_sha"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    targetBranchName: text("target_branch_name").notNull(),
    repoId: uuid("repo_id").default(sql`'00000000-0000-0000-0000-000000000000'`).notNull(), // Valid nil UUID
}, (table) => ({
    idxMergesOpenPr: index("idx_merges_open_pr").on(table.workspaceId, table.prStatus),
    idxMergesWorkspaceId: index("idx_merges_workspace_id").on(table.workspaceId),
    idxMergesRepoId: index("idx_merges_repo_id").on(table.repoId),
}));

// Tags
export const tags = pgTable("tags", {
    id: uuid("id").primaryKey().defaultRandom(),
    tagName: text("tag_name").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Execution Process Logs
export const executionProcessLogs = pgTable("execution_process_logs", {
    executionId: uuid("execution_id").notNull().references(() => executionProcesses.id, { onDelete: "cascade" }),
    logs: text("logs").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    insertedAt: timestamp("inserted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxExecutionProcessLogsExecutionIdInsertedAt: index("idx_execution_process_logs_execution_id_inserted_at").on(table.executionId, table.insertedAt),
}));

// Coding Agent Turns
export const codingAgentTurns = pgTable("coding_agent_turns", {
    id: uuid("id").primaryKey().defaultRandom(),
    executionProcessId: uuid("execution_process_id").notNull().references(() => executionProcesses.id, { onDelete: "cascade" }),
    agentSessionId: text("agent_session_id"),
    prompt: text("prompt"),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxCodingAgentTurnsAgentSessionId: index("idx_coding_agent_turns_agent_session_id").on(table.agentSessionId),
    idxCodingAgentTurnsExecutionProcessId: index("idx_coding_agent_turns_execution_process_id").on(table.executionProcessId),
}));

// Team Projects
export const teamProjects = pgTable("team_projects", {
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxTeamProjectsProjectId: index("idx_team_projects_project_id").on(table.projectId),
    idxTeamProjectsTeamId: index("idx_team_projects_team_id").on(table.teamId),
    pk0: primaryKey({ columns: [table.projectId, table.teamId], name: "team_projects_project_id_team_id_pk" })
}));

// Milestones
export const milestones = pgTable("milestones", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxMilestonesProjectId: index("idx_milestones_project_id").on(table.projectId),
}));

// Project Dependencies
export const projectDependencies = pgTable("project_dependencies", {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    dependsOnProjectId: uuid("depends_on_project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    dependencyType: text("dependency_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxProjectDependenciesDependsOn: index("idx_project_dependencies_depends_on").on(table.dependsOnProjectId),
    idxProjectDependenciesProjectId: index("idx_project_dependencies_project_id").on(table.projectId),
}));

// Project Labels
export const projectLabels = pgTable("project_labels", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Project Label Assignments
export const projectLabelAssignments = pgTable("project_label_assignments", {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    labelId: uuid("label_id").notNull().references(() => projectLabels.id, { onDelete: "cascade" }),
}, (table) => ({
    idxProjectLabelAssignmentsLabel: index("idx_project_label_assignments_label").on(table.labelId),
    idxProjectLabelAssignmentsProject: index("idx_project_label_assignments_project").on(table.projectId),
    pk0: primaryKey({ columns: [table.labelId, table.projectId], name: "project_label_assignments_label_id_project_id_pk" })
}));

// Inbox Items
export const inboxItems = pgTable("inbox_items", {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationType: text("notification_type").default("task_assigned").notNull(),
    title: text("title").notNull(),
    message: text("message"),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxInboxItemsCreatedAt: index("idx_inbox_items_created_at").on(table.createdAt),
    idxInboxItemsWorkspaceId: index("idx_inbox_items_workspace_id").on(table.workspaceId),
    idxInboxItemsProjectId: index("idx_inbox_items_project_id").on(table.projectId),
    idxInboxItemsTaskId: index("idx_inbox_items_task_id").on(table.taskId),
    idxInboxItemsIsRead: index("idx_inbox_items_is_read").on(table.isRead),
}));

// Team Invitations
export const teamInvitations = pgTable("team_invitations", {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").default("contributor").notNull(),
    status: text("status").default("pending").notNull(),
    invitedBy: uuid("invited_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    token: text("token"),
}, (table) => ({
    idxTeamInvitationsToken: uniqueIndex("idx_team_invitations_token").on(table.token),
    idxTeamInvitationsPending: uniqueIndex("idx_team_invitations_pending").on(table.teamId, table.email),
    idxTeamInvitationsStatus: index("idx_team_invitations_status").on(table.status),
    idxTeamInvitationsEmail: index("idx_team_invitations_email").on(table.email),
    idxTeamInvitationsTeamId: index("idx_team_invitations_team_id").on(table.teamId),
}));

// Task Comments
export const taskComments = pgTable("task_comments", {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => teamMembers.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email"),
    content: text("content").notNull(),
    isInternal: boolean("is_internal").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), // text in source, fixed to timestamp
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxTaskCommentsCreatedAt: index("idx_task_comments_created_at").on(table.taskId, table.createdAt),
    idxTaskCommentsAuthorId: index("idx_task_comments_author_id").on(table.authorId),
    idxTaskCommentsTaskId: index("idx_task_comments_task_id").on(table.taskId),
}));

// Task Document Links
export const taskDocumentLinks = pgTable("task_document_links", {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxTaskDocumentLinksDocumentId: index("idx_task_document_links_document_id").on(table.documentId),
    idxTaskDocumentLinksTaskId: index("idx_task_document_links_task_id").on(table.taskId),
}));

// Member Project Access
export const memberProjectAccess = pgTable("member_project_access", {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id").notNull().references(() => teamMembers.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    idxMemberProjectAccessProject: index("idx_member_project_access_project").on(table.projectId),
    idxMemberProjectAccessMember: index("idx_member_project_access_member").on(table.memberId),
    idxMemberProjectAccessUnique: uniqueIndex("idx_member_project_access_unique").on(table.memberId, table.projectId),
}));




