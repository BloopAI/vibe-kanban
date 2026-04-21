use db::models::{
    repo::Repo,
    workspace::{CreateWorkspace, Workspace, WorkspaceError},
    workspace_repo::{CreateWorkspaceRepo, WorkspaceRepo},
};
use sqlx::{Sqlite, Transaction};
use uuid::Uuid;

/// Input to [`create_in_tx`]: pure data, no git or container state.
#[derive(Debug, Clone)]
pub struct WorkspaceCreateParams {
    /// Optional human-friendly workspace name (nullable in DB).
    pub name: Option<String>,
    /// Optional parent task this workspace derives from.
    pub task_id: Option<Uuid>,
    /// Branch name to persist on the workspace row. Also used as the
    /// per-repo `target_branch` fallback when a repo in `repo_ids` has no
    /// `default_target_branch` configured.
    pub branch: String,
    /// Repos to link via `workspace_repos`. Each repo's `target_branch`
    /// defaults to the repo's own `default_target_branch`, falling back
    /// to the workspace's `branch` when the repo has none configured.
    pub repo_ids: Vec<Uuid>,
}

#[derive(Debug, thiserror::Error)]
pub enum WorkspaceServiceError {
    #[error(transparent)]
    Workspace(#[from] WorkspaceError),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    #[error("repo not found: {0}")]
    RepoNotFound(Uuid),
}

/// Create a `Workspace` row plus all `workspace_repos` links inside an
/// existing transaction. The caller owns the transaction and is responsible
/// for committing or rolling back.
pub async fn create_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    params: WorkspaceCreateParams,
) -> Result<Workspace, WorkspaceServiceError> {
    let id = Uuid::new_v4();
    let ws = Workspace::create_in_tx(
        tx,
        &CreateWorkspace {
            branch: params.branch.clone(),
            name: params.name,
        },
        id,
        params.task_id,
    )
    .await?;

    if !params.repo_ids.is_empty() {
        let mut repos = Vec::with_capacity(params.repo_ids.len());
        for repo_id in &params.repo_ids {
            let repo = Repo::find_by_id_in_tx(tx, *repo_id)
                .await?
                .ok_or(WorkspaceServiceError::RepoNotFound(*repo_id))?;
            repos.push(CreateWorkspaceRepo {
                repo_id: *repo_id,
                target_branch: repo
                    .default_target_branch
                    .clone()
                    .unwrap_or_else(|| params.branch.clone()),
            });
        }
        WorkspaceRepo::create_many_in_tx(tx, ws.id, &repos).await?;
    }

    Ok(ws)
}

#[cfg(test)]
mod tests {
    use db::DBService;

    use super::*;

    #[tokio::test]
    async fn creates_workspace_with_repos_in_tx() -> Result<(), anyhow::Error> {
        let db = DBService::new_in_memory().await?;
        let pool = &db.pool;

        let mut tx = pool.begin().await?;
        let ws = create_in_tx(
            &mut tx,
            WorkspaceCreateParams {
                name: Some("hello".into()),
                task_id: None,
                branch: "main".into(),
                repo_ids: vec![],
            },
        )
        .await?;
        tx.commit().await?;
        assert_eq!(ws.name.as_deref(), Some("hello"));
        Ok(())
    }

    #[tokio::test]
    async fn create_in_tx_returns_repo_not_found_when_repo_missing() -> Result<(), anyhow::Error> {
        let db = DBService::new_in_memory().await?;
        let pool = &db.pool;

        let mut tx = pool.begin().await?;
        let missing = Uuid::new_v4();
        let res = create_in_tx(
            &mut tx,
            WorkspaceCreateParams {
                name: None,
                task_id: None,
                branch: "main".into(),
                repo_ids: vec![missing],
            },
        )
        .await;
        match res {
            Err(WorkspaceServiceError::RepoNotFound(id)) => {
                assert_eq!(id, missing)
            }
            other => panic!("expected RepoNotFound, got {other:?}"),
        }
        Ok(())
    }
}
