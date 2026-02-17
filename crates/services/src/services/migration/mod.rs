mod error;
mod types;

use std::collections::HashSet;

use api_types::{
    BulkMigrateRequest, BulkMigrateResponse, MigrateIssueRequest, MigrateProjectRequest,
    MigratePullRequestRequest, MigrateWorkspaceRequest,
};
use db::models::{
    merge::{Merge, MergeStatus, PrMerge},
    migration_state::{CreateMigrationState, EntityType, MigrationState, MigrationStatus},
    project::Project,
    task::{Task, TaskStatus},
    workspace::Workspace,
};
pub use error::MigrationError;
use sqlx::SqlitePool;
use tracing::info;
pub use types::*;
use uuid::Uuid;

use crate::services::remote_client::RemoteClient;

const BATCH_SIZE: usize = 100;

pub struct MigrationService {
    sqlite_pool: SqlitePool,
    remote_client: RemoteClient,
}

impl MigrationService {
    pub fn new(sqlite_pool: SqlitePool, remote_client: RemoteClient) -> Self {
        Self {
            sqlite_pool,
            remote_client,
        }
    }

    pub async fn run_migration(
        &self,
        organization_id: Uuid,
        project_ids: HashSet<Uuid>,
    ) -> Result<MigrationReport, MigrationError> {
        let mut report = MigrationReport::default();

        info!(
            "Starting migration to organization {} for {} projects",
            organization_id,
            project_ids.len()
        );

        info!("Phase 1: Migrating projects...");
        self.migrate_projects(organization_id, &project_ids, &mut report)
            .await?;

        info!("Phase 2: Migrating tasks to issues...");
        self.migrate_tasks(&project_ids, &mut report).await?;

        info!("Phase 3: Migrating PR merges to pull requests...");
        self.migrate_pr_merges(&project_ids, &mut report).await?;

        info!("Phase 4: Migrating workspaces...");
        self.migrate_workspaces(&project_ids, &mut report).await?;

        info!(
            "Migration complete. Projects: {}/{}, Tasks: {}/{}, PRs: {}/{}, Workspaces: {}/{}",
            report.projects.migrated,
            report.projects.total,
            report.tasks.migrated,
            report.tasks.total,
            report.pr_merges.migrated,
            report.pr_merges.total,
            report.workspaces.migrated,
            report.workspaces.total
        );

        Ok(report)
    }

    pub async fn get_status(
        &self,
        project_ids: &HashSet<Uuid>,
    ) -> Result<MigrationReport, MigrationError> {
        let projects =
            MigrationState::find_by_entity_type(&self.sqlite_pool, EntityType::Project).await?;
        let tasks =
            MigrationState::find_by_entity_type(&self.sqlite_pool, EntityType::Task).await?;
        let pr_merges =
            MigrationState::find_by_entity_type(&self.sqlite_pool, EntityType::PrMerge).await?;
        let workspaces =
            MigrationState::find_by_entity_type(&self.sqlite_pool, EntityType::Workspace).await?;

        let projects: Vec<_> = projects
            .into_iter()
            .filter(|s| project_ids.contains(&s.local_id))
            .collect();

        Ok(MigrationReport {
            projects: Self::entity_report_from_states(&projects),
            tasks: Self::entity_report_from_states(&tasks),
            pr_merges: Self::entity_report_from_states(&pr_merges),
            workspaces: Self::entity_report_from_states(&workspaces),
            warnings: vec![],
        })
    }

    pub async fn resume_migration(
        &self,
        organization_id: Uuid,
        project_ids: HashSet<Uuid>,
    ) -> Result<MigrationReport, MigrationError> {
        MigrationState::reset_failed(&self.sqlite_pool).await?;
        self.run_migration(organization_id, project_ids).await
    }

    async fn migrate_projects(
        &self,
        organization_id: Uuid,
        project_ids: &HashSet<Uuid>,
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        let all_projects = Project::find_all(&self.sqlite_pool).await?;
        let projects: Vec<_> = all_projects
            .into_iter()
            .filter(|p| project_ids.contains(&p.id))
            .collect();
        report.projects.total = projects.len();

        let mut pending_projects = Vec::new();
        for project in &projects {
            if let Some(existing) =
                MigrationState::find_by_entity(&self.sqlite_pool, EntityType::Project, project.id)
                    .await?
                && existing.status == MigrationStatus::Migrated
            {
                report.projects.skipped += 1;
                continue;
            }
            pending_projects.push(project.clone());
        }

        for chunk in pending_projects.chunks(BATCH_SIZE) {
            self.migrate_project_batch(organization_id, chunk, report)
                .await?;
        }

        Ok(())
    }

    async fn migrate_project_batch(
        &self,
        organization_id: Uuid,
        projects: &[Project],
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        for project in projects {
            MigrationState::upsert(
                &self.sqlite_pool,
                &CreateMigrationState {
                    entity_type: EntityType::Project,
                    local_id: project.id,
                },
            )
            .await?;
        }

        let requests: Vec<MigrateProjectRequest> = projects
            .iter()
            .enumerate()
            .map(|(i, p)| MigrateProjectRequest {
                organization_id,
                name: p.name.clone(),
                color: generate_hsl_color(i),
                created_at: p.created_at,
            })
            .collect();

        let response: BulkMigrateResponse = self
            .remote_client
            .post_authed(
                "/v1/migration/projects",
                Some(&BulkMigrateRequest { items: requests }),
            )
            .await?;

        for (project, remote_id) in projects.iter().zip(response.ids.iter()) {
            MigrationState::mark_migrated(
                &self.sqlite_pool,
                EntityType::Project,
                project.id,
                *remote_id,
            )
            .await?;

            Project::set_remote_project_id(&self.sqlite_pool, project.id, Some(*remote_id)).await?;

            report.projects.migrated += 1;
        }

        Ok(())
    }

    async fn migrate_tasks(
        &self,
        project_ids: &HashSet<Uuid>,
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        let all_tasks = Task::find_all(&self.sqlite_pool).await?;
        let tasks: Vec<_> = all_tasks
            .into_iter()
            .filter(|t| project_ids.contains(&t.project_id))
            .collect();
        report.tasks.total = tasks.len();

        let mut pending_tasks = Vec::new();
        for task in &tasks {
            if let Some(existing) =
                MigrationState::find_by_entity(&self.sqlite_pool, EntityType::Task, task.id).await?
                && existing.status == MigrationStatus::Migrated
            {
                report.tasks.skipped += 1;
                continue;
            }
            pending_tasks.push(task.clone());
        }

        for chunk in pending_tasks.chunks(BATCH_SIZE) {
            self.migrate_task_batch(chunk, report).await?;
        }

        Ok(())
    }

    async fn migrate_task_batch(
        &self,
        tasks: &[Task],
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        for task in tasks {
            MigrationState::upsert(
                &self.sqlite_pool,
                &CreateMigrationState {
                    entity_type: EntityType::Task,
                    local_id: task.id,
                },
            )
            .await?;
        }

        let mut requests = Vec::new();
        let mut request_task_ids = Vec::new();

        for task in tasks {
            let remote_project_id = MigrationState::get_remote_id(
                &self.sqlite_pool,
                EntityType::Project,
                task.project_id,
            )
            .await?;

            match remote_project_id {
                Some(project_id) => {
                    requests.push(MigrateIssueRequest {
                        project_id,
                        status_name: map_task_status(&task.status),
                        title: task.title.chars().take(255).collect(),
                        description: task.description.clone(),
                        created_at: task.created_at,
                    });
                    request_task_ids.push(task.id);
                }
                None => {
                    let error_msg = format!("Project {} not migrated", task.project_id);
                    MigrationState::mark_skipped(
                        &self.sqlite_pool,
                        EntityType::Task,
                        task.id,
                        &error_msg,
                    )
                    .await?;
                    report.tasks.skipped += 1;
                    report
                        .warnings
                        .push(format!("Skipped task {}: {}", task.id, error_msg));
                }
            }
        }

        if requests.is_empty() {
            return Ok(());
        }

        let response: BulkMigrateResponse = self
            .remote_client
            .post_authed(
                "/v1/migration/issues",
                Some(&BulkMigrateRequest { items: requests }),
            )
            .await?;

        for (task_id, remote_id) in request_task_ids.iter().zip(response.ids.iter()) {
            MigrationState::mark_migrated(
                &self.sqlite_pool,
                EntityType::Task,
                *task_id,
                *remote_id,
            )
            .await?;
            report.tasks.migrated += 1;
        }

        Ok(())
    }

    async fn migrate_pr_merges(
        &self,
        project_ids: &HashSet<Uuid>,
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        let all_pr_merges = Merge::find_all_pr(&self.sqlite_pool).await?;

        let mut pr_merges = Vec::new();
        for pr_merge in all_pr_merges {
            if let Some(workspace) =
                Workspace::find_by_id(&self.sqlite_pool, pr_merge.workspace_id).await?
                && let Some(task_id) = workspace.task_id
                && let Some(task) = Task::find_by_id(&self.sqlite_pool, task_id).await?
                && project_ids.contains(&task.project_id)
            {
                pr_merges.push(pr_merge);
            }
        }
        report.pr_merges.total = pr_merges.len();

        let mut pending_merges = Vec::new();
        for pr_merge in &pr_merges {
            if let Some(existing) =
                MigrationState::find_by_entity(&self.sqlite_pool, EntityType::PrMerge, pr_merge.id)
                    .await?
                && existing.status == MigrationStatus::Migrated
            {
                report.pr_merges.skipped += 1;
                continue;
            }
            pending_merges.push(pr_merge.clone());
        }

        for chunk in pending_merges.chunks(BATCH_SIZE) {
            self.migrate_pr_merge_batch(chunk, report).await?;
        }

        Ok(())
    }

    async fn migrate_pr_merge_batch(
        &self,
        pr_merges: &[PrMerge],
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        for pr_merge in pr_merges {
            MigrationState::upsert(
                &self.sqlite_pool,
                &CreateMigrationState {
                    entity_type: EntityType::PrMerge,
                    local_id: pr_merge.id,
                },
            )
            .await?;
        }

        let mut requests = Vec::new();
        let mut request_merge_ids = Vec::new();

        for pr_merge in pr_merges {
            let workspace = Workspace::find_by_id(&self.sqlite_pool, pr_merge.workspace_id).await?;

            let issue_id = match workspace.and_then(|ws| ws.task_id) {
                Some(task_id) => {
                    MigrationState::get_remote_id(&self.sqlite_pool, EntityType::Task, task_id)
                        .await?
                }
                None => None,
            };

            match issue_id {
                Some(remote_issue_id) => {
                    requests.push(MigratePullRequestRequest {
                        url: pr_merge.pr_info.url.clone(),
                        number: pr_merge.pr_info.number as i32,
                        status: map_merge_status(&pr_merge.pr_info.status),
                        merged_at: pr_merge.pr_info.merged_at,
                        merge_commit_sha: pr_merge.pr_info.merge_commit_sha.clone(),
                        target_branch_name: pr_merge.target_branch_name.clone(),
                        issue_id: remote_issue_id,
                    });
                    request_merge_ids.push(pr_merge.id);
                }
                None => {
                    let error_msg = format!(
                        "Cannot resolve issue for PR merge {} (workspace: {})",
                        pr_merge.id, pr_merge.workspace_id
                    );
                    MigrationState::mark_skipped(
                        &self.sqlite_pool,
                        EntityType::PrMerge,
                        pr_merge.id,
                        &error_msg,
                    )
                    .await?;
                    report.pr_merges.skipped += 1;
                    report
                        .warnings
                        .push(format!("Skipped PR {}: {}", pr_merge.id, error_msg));
                }
            }
        }

        if requests.is_empty() {
            return Ok(());
        }

        let response: BulkMigrateResponse = self
            .remote_client
            .post_authed(
                "/v1/migration/pull_requests",
                Some(&BulkMigrateRequest { items: requests }),
            )
            .await?;

        for (merge_id, remote_id) in request_merge_ids.iter().zip(response.ids.iter()) {
            MigrationState::mark_migrated(
                &self.sqlite_pool,
                EntityType::PrMerge,
                *merge_id,
                *remote_id,
            )
            .await?;
            report.pr_merges.migrated += 1;
        }

        Ok(())
    }

    async fn migrate_workspaces(
        &self,
        project_ids: &HashSet<Uuid>,
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        let all_workspaces = Workspace::fetch_all(&self.sqlite_pool).await?;

        let mut workspaces = Vec::new();
        for workspace in all_workspaces {
            if let Some(task_id) = workspace.task_id
                && let Some(task) = Task::find_by_id(&self.sqlite_pool, task_id).await?
                && project_ids.contains(&task.project_id)
            {
                workspaces.push(workspace);
            }
        }
        report.workspaces.total = workspaces.len();

        let mut pending_workspaces = Vec::new();
        for workspace in &workspaces {
            if let Some(existing) = MigrationState::find_by_entity(
                &self.sqlite_pool,
                EntityType::Workspace,
                workspace.id,
            )
            .await?
                && existing.status == MigrationStatus::Migrated
            {
                report.workspaces.skipped += 1;
                continue;
            }
            pending_workspaces.push(workspace.clone());
        }

        for chunk in pending_workspaces.chunks(BATCH_SIZE) {
            self.migrate_workspace_batch(chunk, report).await?;
        }

        Ok(())
    }

    async fn migrate_workspace_batch(
        &self,
        workspaces: &[Workspace],
        report: &mut MigrationReport,
    ) -> Result<(), MigrationError> {
        for workspace in workspaces {
            MigrationState::upsert(
                &self.sqlite_pool,
                &CreateMigrationState {
                    entity_type: EntityType::Workspace,
                    local_id: workspace.id,
                },
            )
            .await?;
        }

        let mut requests = Vec::new();
        let mut request_workspace_ids = Vec::new();

        for workspace in workspaces {
            let task_id = match workspace.task_id {
                Some(id) => id,
                None => {
                    let error_msg = "Workspace has no task_id".to_string();
                    MigrationState::mark_skipped(
                        &self.sqlite_pool,
                        EntityType::Workspace,
                        workspace.id,
                        &error_msg,
                    )
                    .await?;
                    report.workspaces.skipped += 1;
                    report
                        .warnings
                        .push(format!("Skipped workspace {}: {}", workspace.id, error_msg));
                    continue;
                }
            };

            let task = match Task::find_by_id(&self.sqlite_pool, task_id).await? {
                Some(t) => t,
                None => {
                    let error_msg = format!("Task {} not found for workspace", task_id);
                    MigrationState::mark_skipped(
                        &self.sqlite_pool,
                        EntityType::Workspace,
                        workspace.id,
                        &error_msg,
                    )
                    .await?;
                    report.workspaces.skipped += 1;
                    report
                        .warnings
                        .push(format!("Skipped workspace {}: {}", workspace.id, error_msg));
                    continue;
                }
            };

            let remote_project_id = MigrationState::get_remote_id(
                &self.sqlite_pool,
                EntityType::Project,
                task.project_id,
            )
            .await?;

            let remote_project_id = match remote_project_id {
                Some(id) => id,
                None => {
                    let error_msg = format!("Project {} not migrated", task.project_id);
                    MigrationState::mark_skipped(
                        &self.sqlite_pool,
                        EntityType::Workspace,
                        workspace.id,
                        &error_msg,
                    )
                    .await?;
                    report.workspaces.skipped += 1;
                    report
                        .warnings
                        .push(format!("Skipped workspace {}: {}", workspace.id, error_msg));
                    continue;
                }
            };

            let remote_issue_id =
                MigrationState::get_remote_id(&self.sqlite_pool, EntityType::Task, task_id).await?;

            if remote_issue_id.is_none() {
                let error_msg = format!("Task {} not migrated", task_id);
                MigrationState::mark_skipped(
                    &self.sqlite_pool,
                    EntityType::Workspace,
                    workspace.id,
                    &error_msg,
                )
                .await?;
                report.workspaces.skipped += 1;
                report
                    .warnings
                    .push(format!("Skipped workspace {}: {}", workspace.id, error_msg));
                continue;
            }

            requests.push(MigrateWorkspaceRequest {
                project_id: remote_project_id,
                issue_id: remote_issue_id,
                local_workspace_id: workspace.id,
                archived: workspace.archived,
                created_at: workspace.created_at,
            });
            request_workspace_ids.push(workspace.id);
        }

        if requests.is_empty() {
            return Ok(());
        }

        let response: BulkMigrateResponse = self
            .remote_client
            .post_authed(
                "/v1/migration/workspaces",
                Some(&BulkMigrateRequest { items: requests }),
            )
            .await?;

        for (workspace_id, remote_id) in request_workspace_ids.iter().zip(response.ids.iter()) {
            MigrationState::mark_migrated(
                &self.sqlite_pool,
                EntityType::Workspace,
                *workspace_id,
                *remote_id,
            )
            .await?;
            report.workspaces.migrated += 1;
        }

        Ok(())
    }

    fn entity_report_from_states(states: &[MigrationState]) -> EntityReport {
        let mut report = EntityReport {
            total: states.len(),
            ..Default::default()
        };

        for state in states {
            match state.status {
                MigrationStatus::Migrated => report.migrated += 1,
                MigrationStatus::Failed => {
                    report.failed += 1;
                    if let Some(ref msg) = state.error_message {
                        report.errors.push(EntityError {
                            local_id: state.local_id,
                            error: msg.clone(),
                        });
                    }
                }
                MigrationStatus::Skipped => report.skipped += 1,
                MigrationStatus::Pending => {}
            }
        }

        report
    }
}

fn map_task_status(status: &TaskStatus) -> String {
    match status {
        TaskStatus::Todo => "To do".to_string(),
        TaskStatus::InProgress => "In progress".to_string(),
        TaskStatus::InReview => "In review".to_string(),
        TaskStatus::Done => "Done".to_string(),
        TaskStatus::Cancelled => "Cancelled".to_string(),
    }
}

fn map_merge_status(status: &MergeStatus) -> String {
    match status {
        MergeStatus::Open => "open".to_string(),
        MergeStatus::Merged => "merged".to_string(),
        MergeStatus::Closed => "closed".to_string(),
        MergeStatus::Unknown => "open".to_string(),
    }
}

fn generate_hsl_color(index: usize) -> String {
    let hues = [217, 142, 38, 258, 0, 180, 300, 60];
    let h = hues[index % hues.len()];
    let s = 70 + (index / hues.len()) % 20;
    let l = 50 + (index / hues.len()) % 15;
    format!("{} {}% {}%", h, s, l)
}
