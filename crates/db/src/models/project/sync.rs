//! Hive sync operations for projects.
//!
//! These operations handle synchronization between local projects and the Hive
//! (remote server), including remote project management and linking.

use chrono::{DateTime, Utc};
use sqlx::{Executor, QueryBuilder, Sqlite, SqlitePool};
use uuid::Uuid;

use super::Project;

impl Project {
    pub async fn find_by_remote_project_id<'e, E>(
        executor: E,
        remote_project_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                      github_enabled as "github_enabled!: bool",
                      github_owner,
                      github_repo,
                      github_open_issues as "github_open_issues!: i32",
                      github_open_prs as "github_open_prs!: i32",
                      github_last_synced_at as "github_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE remote_project_id = $1
               LIMIT 1"#,
            remote_project_id
        )
        .fetch_optional(executor)
        .await
    }

    pub async fn set_remote_project_id(
        pool: &SqlitePool,
        id: Uuid,
        remote_project_id: Option<Uuid>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE projects
               SET remote_project_id = $2
               WHERE id = $1"#,
            id,
            remote_project_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Transaction-compatible version of set_remote_project_id
    pub async fn set_remote_project_id_tx<'e, E>(
        executor: E,
        id: Uuid,
        remote_project_id: Option<Uuid>,
    ) -> Result<(), sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query!(
            r#"UPDATE projects
               SET remote_project_id = $2
               WHERE id = $1"#,
            id,
            remote_project_id
        )
        .execute(executor)
        .await?;

        Ok(())
    }

    /// Find all local projects that are not linked to a remote project.
    /// These are projects with is_remote=false and remote_project_id IS NULL.
    pub async fn find_unlinked(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                      github_enabled as "github_enabled!: bool",
                      github_owner,
                      github_repo,
                      github_open_issues as "github_open_issues!: i32",
                      github_open_prs as "github_open_prs!: i32",
                      github_last_synced_at as "github_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE is_remote = 0 AND remote_project_id IS NULL
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    /// Find all remote projects (synced from other nodes via the Hive)
    pub async fn find_remote_projects(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                      github_enabled as "github_enabled!: bool",
                      github_owner,
                      github_repo,
                      github_open_issues as "github_open_issues!: i32",
                      github_open_prs as "github_open_prs!: i32",
                      github_last_synced_at as "github_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE is_remote = 1
               ORDER BY name"#
        )
        .fetch_all(pool)
        .await
    }

    /// Find all local projects (created on this node)
    pub async fn find_local_projects(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                      github_enabled as "github_enabled!: bool",
                      github_owner,
                      github_repo,
                      github_open_issues as "github_open_issues!: i32",
                      github_open_prs as "github_open_prs!: i32",
                      github_last_synced_at as "github_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE is_remote = 0
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    /// Create or update a remote project synced from the Hive.
    ///
    /// Remote projects are created alongside local projects - they represent the same
    /// repository path but on different nodes. The database schema supports:
    /// - Local projects: unique by `git_repo_path` among local projects only
    /// - Remote projects: unique by `remote_project_id` (swarm project ID)
    ///
    /// ON CONFLICT(remote_project_id) handles updates when re-syncing the same swarm project.
    #[allow(clippy::too_many_arguments)]
    pub async fn upsert_remote_project(
        pool: &SqlitePool,
        local_id: Uuid,
        remote_project_id: Uuid,
        name: String,
        git_repo_path: String,
        source_node_id: Uuid,
        source_node_name: String,
        source_node_public_url: Option<String>,
        source_node_status: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        let now = Utc::now();
        sqlx::query_as!(
            Project,
            r#"INSERT INTO projects (
                    id,
                    name,
                    git_repo_path,
                    remote_project_id,
                    is_remote,
                    source_node_id,
                    source_node_name,
                    source_node_public_url,
                    source_node_status,
                    remote_last_synced_at
                ) VALUES (
                    $1, $2, $3, $4, 1, $5, $6, $7, $8, $9
                )
                ON CONFLICT(remote_project_id) WHERE remote_project_id IS NOT NULL DO UPDATE SET
                    name = excluded.name,
                    git_repo_path = excluded.git_repo_path,
                    source_node_id = excluded.source_node_id,
                    source_node_name = excluded.source_node_name,
                    source_node_public_url = excluded.source_node_public_url,
                    source_node_status = excluded.source_node_status,
                    remote_last_synced_at = excluded.remote_last_synced_at,
                    updated_at = datetime('now', 'subsec')
                RETURNING id as "id!: Uuid",
                          name,
                          git_repo_path,
                          setup_script,
                          dev_script,
                          cleanup_script,
                          copy_files,
                          parallel_setup_script as "parallel_setup_script!: bool",
                          remote_project_id as "remote_project_id: Uuid",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>",
                          is_remote as "is_remote!: bool",
                          source_node_id as "source_node_id: Uuid",
                          source_node_name,
                          source_node_public_url,
                          source_node_status,
                          remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                          github_enabled as "github_enabled!: bool",
                          github_owner,
                          github_repo,
                          github_open_issues as "github_open_issues!: i32",
                          github_open_prs as "github_open_prs!: i32",
                          github_last_synced_at as "github_last_synced_at: DateTime<Utc>""#,
            local_id,
            name,
            git_repo_path,
            remote_project_id,
            source_node_id,
            source_node_name,
            source_node_public_url,
            source_node_status,
            now
        )
        .fetch_one(pool)
        .await
    }

    /// Update the sync status for a remote project
    pub async fn update_remote_sync_status(
        pool: &SqlitePool,
        id: Uuid,
        source_node_status: Option<String>,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE projects
               SET source_node_status = $2,
                   remote_last_synced_at = $3
               WHERE id = $1"#,
            id,
            source_node_status,
            now
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Batch update source_node_status and source_node_public_url for all remote projects
    /// from a given source node.
    ///
    /// This is used to sync node status from the Hive after connection, ensuring
    /// that the local DB reflects the actual status of remote nodes.
    pub async fn update_node_status_by_source_node_id(
        pool: &SqlitePool,
        source_node_id: Uuid,
        status: &str,
        public_url: Option<&str>,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            r#"UPDATE projects
               SET source_node_status = ?2,
                   source_node_public_url = ?3,
                   updated_at = datetime('now', 'subsec')
               WHERE source_node_id = ?1 AND is_remote = 1"#,
        )
        .bind(source_node_id)
        .bind(status)
        .bind(public_url)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Get all unique source_node_ids from remote projects.
    ///
    /// Used to determine which node statuses need to be synced from the Hive.
    pub async fn get_remote_source_node_ids(pool: &SqlitePool) -> Result<Vec<Uuid>, sqlx::Error> {
        let rows: Vec<(Uuid,)> = sqlx::query_as(
            r#"SELECT DISTINCT source_node_id
               FROM projects
               WHERE is_remote = 1 AND source_node_id IS NOT NULL"#,
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|(id,)| id).collect())
    }

    /// Update the remote_project_id for an existing remote project.
    ///
    /// This is used when a remote project was synced before the remote_project_id
    /// was properly set. It updates the link to the hive project and also updates
    /// the sync timestamp.
    pub async fn update_remote_project_link(
        pool: &SqlitePool,
        id: Uuid,
        remote_project_id: Uuid,
        source_node_status: Option<String>,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE projects
               SET remote_project_id = $2,
                   source_node_status = $3,
                   remote_last_synced_at = $4,
                   updated_at = datetime('now', 'subsec')
               WHERE id = $1"#,
            id,
            remote_project_id,
            source_node_status,
            now
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Delete remote projects that are no longer in the Hive.
    ///
    /// Uses a single bulk DELETE query with NOT IN clause for O(1) database calls
    /// instead of O(n) fetch + O(m) deletes.
    ///
    /// IMPORTANT: Must filter by source_node_id to avoid deleting projects from other nodes.
    pub async fn delete_stale_remote_projects(
        pool: &SqlitePool,
        source_node_id: Uuid,
        active_remote_project_ids: &[Uuid],
    ) -> Result<u64, sqlx::Error> {
        // If the list is empty, don't delete anything (safety check)
        if active_remote_project_ids.is_empty() {
            return Ok(0);
        }

        let mut builder = QueryBuilder::<Sqlite>::new(
            "DELETE FROM projects WHERE is_remote = 1 AND source_node_id = ",
        );
        builder.push_bind(source_node_id);
        builder.push(" AND remote_project_id IS NOT NULL AND remote_project_id NOT IN (");
        {
            let mut separated = builder.separated(", ");
            for id in active_remote_project_ids {
                separated.push_bind(id);
            }
        }
        builder.push(")");
        let result = builder.build().execute(pool).await?;
        Ok(result.rows_affected())
    }

    /// Get all remote_project_ids from local projects (for exclusion during remote sync)
    ///
    /// This returns the set of project IDs that are already linked to local projects,
    /// so they should be excluded from the remote project list.
    pub async fn find_local_project_remote_ids(
        pool: &SqlitePool,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        let rows = sqlx::query_scalar!(
            r#"SELECT remote_project_id as "remote_project_id: Uuid"
               FROM projects
               WHERE is_remote = 0 AND remote_project_id IS NOT NULL"#
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().flatten().collect())
    }

    /// Find all local projects that have a remote_project_id (linked to cloud).
    ///
    /// This returns all projects where is_remote=false (local projects) AND
    /// remote_project_id IS NOT NULL (linked to the hive).
    /// Used for auto-linking projects when a node connects to the hive.
    pub async fn find_all_with_remote_id(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      remote_project_id as "remote_project_id: Uuid",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>",
                      is_remote as "is_remote!: bool",
                      source_node_id as "source_node_id: Uuid",
                      source_node_name,
                      source_node_public_url,
                      source_node_status,
                      remote_last_synced_at as "remote_last_synced_at: DateTime<Utc>",
                      github_enabled as "github_enabled!: bool",
                      github_owner,
                      github_repo,
                      github_open_issues as "github_open_issues!: i32",
                      github_open_prs as "github_open_prs!: i32",
                      github_last_synced_at as "github_last_synced_at: DateTime<Utc>"
               FROM projects
               WHERE is_remote = 0 AND remote_project_id IS NOT NULL
               ORDER BY name"#
        )
        .fetch_all(pool)
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::project::CreateProject;
    use crate::test_utils::create_test_pool;

    #[tokio::test]
    async fn test_find_unlinked_empty() {
        let (pool, _temp_dir) = create_test_pool().await;

        let projects = Project::find_unlinked(&pool).await.unwrap();
        assert!(projects.is_empty());
    }

    #[tokio::test]
    async fn test_find_unlinked() {
        let (pool, _temp_dir) = create_test_pool().await;

        let project_id = Uuid::new_v4();
        let create_data = CreateProject {
            name: "Unlinked Test".to_string(),
            git_repo_path: "/unlinked/test".to_string(),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };

        Project::create(&pool, &create_data, project_id)
            .await
            .unwrap();

        let projects = Project::find_unlinked(&pool).await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, project_id);
    }

    #[tokio::test]
    async fn test_set_remote_project_id() {
        let (pool, _temp_dir) = create_test_pool().await;

        let project_id = Uuid::new_v4();
        let remote_id = Uuid::new_v4();
        let create_data = CreateProject {
            name: "Link Test".to_string(),
            git_repo_path: "/link/test".to_string(),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };

        Project::create(&pool, &create_data, project_id)
            .await
            .unwrap();

        // Initially unlinked
        let projects = Project::find_unlinked(&pool).await.unwrap();
        assert_eq!(projects.len(), 1);

        // Link to remote
        Project::set_remote_project_id(&pool, project_id, Some(remote_id))
            .await
            .unwrap();

        // Now linked
        let projects = Project::find_unlinked(&pool).await.unwrap();
        assert!(projects.is_empty());

        let linked = Project::find_all_with_remote_id(&pool).await.unwrap();
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].remote_project_id, Some(remote_id));
    }

    #[tokio::test]
    async fn test_find_remote_projects_empty() {
        let (pool, _temp_dir) = create_test_pool().await;

        let projects = Project::find_remote_projects(&pool).await.unwrap();
        assert!(projects.is_empty());
    }

    #[tokio::test]
    async fn test_find_local_projects() {
        let (pool, _temp_dir) = create_test_pool().await;

        let project_id = Uuid::new_v4();
        let create_data = CreateProject {
            name: "Local Test".to_string(),
            git_repo_path: "/local/test".to_string(),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };

        Project::create(&pool, &create_data, project_id)
            .await
            .unwrap();

        let local = Project::find_local_projects(&pool).await.unwrap();
        assert_eq!(local.len(), 1);
        assert!(!local[0].is_remote);
    }

    // DEPRECATED: Remote project caching is disabled.
    // We now fetch swarm projects directly from the Hive instead of caching
    // remote project entries locally.
    #[tokio::test]
    #[ignore = "remote project caching is deprecated - we now fetch from hive directly"]
    async fn test_upsert_remote_project() {
        let (pool, _temp_dir) = create_test_pool().await;

        let local_id = Uuid::new_v4();
        let remote_id = Uuid::new_v4();
        let source_node_id = Uuid::new_v4();

        let project = Project::upsert_remote_project(
            &pool,
            local_id,
            remote_id,
            "Remote Project".to_string(),
            "/remote/path".to_string(),
            source_node_id,
            "Node 1".to_string(),
            Some("https://node1.example.com".to_string()),
            Some("online".to_string()),
        )
        .await
        .unwrap();

        assert!(project.is_remote);
        assert_eq!(project.remote_project_id, Some(remote_id));
        assert_eq!(project.source_node_id, Some(source_node_id));
        assert_eq!(project.source_node_name, Some("Node 1".to_string()));

        let remotes = Project::find_remote_projects(&pool).await.unwrap();
        assert_eq!(remotes.len(), 1);
    }

    #[tokio::test]
    #[ignore = "remote project caching is deprecated - we now fetch from hive directly"]
    async fn test_update_remote_sync_status() {
        let (pool, _temp_dir) = create_test_pool().await;

        let local_id = Uuid::new_v4();
        let remote_id = Uuid::new_v4();
        let source_node_id = Uuid::new_v4();

        Project::upsert_remote_project(
            &pool,
            local_id,
            remote_id,
            "Sync Status Test".to_string(),
            "/sync/status/test".to_string(),
            source_node_id,
            "Node".to_string(),
            None,
            Some("online".to_string()),
        )
        .await
        .unwrap();

        Project::update_remote_sync_status(&pool, local_id, Some("offline".to_string()))
            .await
            .unwrap();

        let project = Project::find_by_id(&pool, local_id).await.unwrap().unwrap();
        assert_eq!(project.source_node_status, Some("offline".to_string()));
    }

    #[tokio::test]
    async fn test_find_local_project_remote_ids() {
        let (pool, _temp_dir) = create_test_pool().await;

        let project_id = Uuid::new_v4();
        let remote_id = Uuid::new_v4();
        let create_data = CreateProject {
            name: "Remote ID Test".to_string(),
            git_repo_path: "/remote/id/test".to_string(),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };

        Project::create(&pool, &create_data, project_id)
            .await
            .unwrap();
        Project::set_remote_project_id(&pool, project_id, Some(remote_id))
            .await
            .unwrap();

        let ids = Project::find_local_project_remote_ids(&pool).await.unwrap();
        assert_eq!(ids.len(), 1);
        assert_eq!(ids[0], remote_id);
    }

    #[tokio::test]
    async fn test_find_by_remote_project_id() {
        let (pool, _temp_dir) = create_test_pool().await;

        let project_id = Uuid::new_v4();
        let remote_id = Uuid::new_v4();
        let create_data = CreateProject {
            name: "Find by Remote".to_string(),
            git_repo_path: "/find/by/remote".to_string(),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };

        Project::create(&pool, &create_data, project_id)
            .await
            .unwrap();
        Project::set_remote_project_id(&pool, project_id, Some(remote_id))
            .await
            .unwrap();

        let found = Project::find_by_remote_project_id(&pool, remote_id)
            .await
            .unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, project_id);

        let not_found = Project::find_by_remote_project_id(&pool, Uuid::new_v4())
            .await
            .unwrap();
        assert!(not_found.is_none());
    }

    // ========================================================================
    // Phase 3 Tests: Multi-node path collision handling
    // DEPRECATED: Remote project caching is disabled.
    // We now fetch swarm projects directly from the Hive.
    // ========================================================================

    #[tokio::test]
    #[ignore = "remote project caching is deprecated - we now fetch from hive directly"]
    async fn test_multiple_remote_projects_same_path_different_nodes() {
        let (pool, _temp_dir) = create_test_pool().await;

        let node_a = Uuid::new_v4();
        let node_b = Uuid::new_v4();
        let swarm_project_a = Uuid::new_v4();
        let swarm_project_b = Uuid::new_v4();
        let shared_path = "/home/david/Code/Shohin";

        // Node A syncs a project at /home/david/Code/Shohin
        let project_a = Project::upsert_remote_project(
            &pool,
            Uuid::new_v4(),
            swarm_project_a,
            "Shohin (Node A)".to_string(),
            shared_path.to_string(),
            node_a,
            "Node A".to_string(),
            None,
            Some("online".to_string()),
        )
        .await
        .unwrap();

        assert!(project_a.is_remote);
        assert_eq!(project_a.source_node_id, Some(node_a));

        // Node B syncs a different swarm project at the SAME path
        let project_b = Project::upsert_remote_project(
            &pool,
            Uuid::new_v4(),
            swarm_project_b,
            "Shohin (Node B)".to_string(),
            shared_path.to_string(),
            node_b,
            "Node B".to_string(),
            None,
            Some("online".to_string()),
        )
        .await
        .unwrap();

        assert!(project_b.is_remote);
        assert_eq!(project_b.source_node_id, Some(node_b));
        assert_ne!(project_a.id, project_b.id); // Different entries!

        // Both projects should be visible
        let remotes = Project::find_remote_projects(&pool).await.unwrap();
        assert_eq!(remotes.len(), 2);

        // Verify we can find each by remote project id
        let found_a = Project::find_by_remote_project_id(&pool, swarm_project_a)
            .await
            .unwrap();
        let found_b = Project::find_by_remote_project_id(&pool, swarm_project_b)
            .await
            .unwrap();
        assert!(found_a.is_some());
        assert!(found_b.is_some());
        assert_eq!(found_a.unwrap().source_node_id, Some(node_a));
        assert_eq!(found_b.unwrap().source_node_id, Some(node_b));
    }

    #[tokio::test]
    #[ignore = "remote project caching is deprecated - we now fetch from hive directly"]
    async fn test_find_remote_by_path_and_node() {
        let (pool, _temp_dir) = create_test_pool().await;

        let node_a = Uuid::new_v4();
        let node_b = Uuid::new_v4();
        let shared_path = "/home/david/Code/TestRepo";

        // Create remote project from Node A
        let project_a = Project::upsert_remote_project(
            &pool,
            Uuid::new_v4(),
            Uuid::new_v4(),
            "TestRepo".to_string(),
            shared_path.to_string(),
            node_a,
            "Node A".to_string(),
            None,
            None,
        )
        .await
        .unwrap();

        // Create remote project from Node B at same path
        let project_b = Project::upsert_remote_project(
            &pool,
            Uuid::new_v4(),
            Uuid::new_v4(),
            "TestRepo".to_string(),
            shared_path.to_string(),
            node_b,
            "Node B".to_string(),
            None,
            None,
        )
        .await
        .unwrap();

        // find_remote_by_path_and_node should find the correct one for each node
        let found_a = Project::find_remote_by_path_and_node(&pool, shared_path, node_a)
            .await
            .unwrap();
        let found_b = Project::find_remote_by_path_and_node(&pool, shared_path, node_b)
            .await
            .unwrap();

        assert!(found_a.is_some());
        assert!(found_b.is_some());
        assert_eq!(found_a.unwrap().id, project_a.id);
        assert_eq!(found_b.unwrap().id, project_b.id);

        // Searching for a non-existent node should return None
        let not_found = Project::find_remote_by_path_and_node(&pool, shared_path, Uuid::new_v4())
            .await
            .unwrap();
        assert!(not_found.is_none());
    }

    #[tokio::test]
    #[ignore = "remote project caching is deprecated - we now fetch from hive directly"]
    async fn test_local_and_remote_projects_coexist() {
        let (pool, _temp_dir) = create_test_pool().await;

        let local_project_id = Uuid::new_v4();
        let remote_node_id = Uuid::new_v4();
        let swarm_project_id = Uuid::new_v4();
        let shared_path = "/home/david/Code/LocalRepo";

        // Create a LOCAL project first
        let local_project = CreateProject {
            name: "LocalRepo".to_string(),
            git_repo_path: shared_path.to_string(),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };
        Project::create(&pool, &local_project, local_project_id)
            .await
            .unwrap();

        // Sync a REMOTE project at the same path from another node
        let remote = Project::upsert_remote_project(
            &pool,
            Uuid::new_v4(),
            swarm_project_id,
            "LocalRepo (Remote)".to_string(),
            shared_path.to_string(),
            remote_node_id,
            "Remote Node".to_string(),
            None,
            None,
        )
        .await
        .unwrap();

        // Remote entry should be created (not return the local project)
        assert!(remote.is_remote);
        assert_ne!(remote.id, local_project_id);
        assert_eq!(remote.remote_project_id, Some(swarm_project_id));

        // Both projects should exist
        let all = Project::find_all(&pool).await.unwrap();
        assert_eq!(all.len(), 2);

        let local = all.iter().find(|p| !p.is_remote).unwrap();
        let remote_proj = all.iter().find(|p| p.is_remote).unwrap();
        assert_eq!(local.id, local_project_id);
        assert_eq!(remote_proj.source_node_id, Some(remote_node_id));
    }

    #[tokio::test]
    #[ignore = "remote project caching is deprecated - we now fetch from hive directly"]
    async fn test_find_by_git_repo_path_only_returns_local() {
        let (pool, _temp_dir) = create_test_pool().await;

        let shared_path = "/home/david/Code/SharedPath";

        // Create a remote project
        Project::upsert_remote_project(
            &pool,
            Uuid::new_v4(),
            Uuid::new_v4(),
            "Remote Project".to_string(),
            shared_path.to_string(),
            Uuid::new_v4(),
            "Some Node".to_string(),
            None,
            None,
        )
        .await
        .unwrap();

        // find_by_git_repo_path should NOT find the remote project
        let found = Project::find_by_git_repo_path(&pool, shared_path)
            .await
            .unwrap();
        assert!(found.is_none());

        // Now create a local project at the same path (this would fail before migration)
        // After migration, local projects have separate unique constraint
        let local_id = Uuid::new_v4();
        let local_project = CreateProject {
            name: "Local Project".to_string(),
            git_repo_path: shared_path.to_string(),
            use_existing_repo: true,
            clone_url: None,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        };
        Project::create(&pool, &local_project, local_id)
            .await
            .unwrap();

        // Now find_by_git_repo_path should find the local project
        let found = Project::find_by_git_repo_path(&pool, shared_path)
            .await
            .unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id, local_id);
    }

    #[tokio::test]
    #[ignore = "remote project caching is deprecated - we now fetch from hive directly"]
    async fn test_delete_stale_remote_projects_scoped_to_node() {
        let (pool, _temp_dir) = create_test_pool().await;

        let node_a = Uuid::new_v4();
        let node_b = Uuid::new_v4();
        let swarm_project_a1 = Uuid::new_v4();
        let swarm_project_a2 = Uuid::new_v4();
        let swarm_project_b = Uuid::new_v4();

        // Create 2 projects from Node A
        Project::upsert_remote_project(
            &pool,
            Uuid::new_v4(),
            swarm_project_a1,
            "A1".to_string(),
            "/path/a1".to_string(),
            node_a,
            "Node A".to_string(),
            None,
            None,
        )
        .await
        .unwrap();

        Project::upsert_remote_project(
            &pool,
            Uuid::new_v4(),
            swarm_project_a2,
            "A2".to_string(),
            "/path/a2".to_string(),
            node_a,
            "Node A".to_string(),
            None,
            None,
        )
        .await
        .unwrap();

        // Create 1 project from Node B
        Project::upsert_remote_project(
            &pool,
            Uuid::new_v4(),
            swarm_project_b,
            "B1".to_string(),
            "/path/b1".to_string(),
            node_b,
            "Node B".to_string(),
            None,
            None,
        )
        .await
        .unwrap();

        assert_eq!(Project::find_remote_projects(&pool).await.unwrap().len(), 3);

        // Delete stale from Node A - only keep swarm_project_a1
        // This should delete swarm_project_a2 but NOT swarm_project_b
        let deleted = Project::delete_stale_remote_projects(&pool, node_a, &[swarm_project_a1])
            .await
            .unwrap();

        assert_eq!(deleted, 1); // Only A2 deleted

        let remaining = Project::find_remote_projects(&pool).await.unwrap();
        assert_eq!(remaining.len(), 2);

        // Verify A1 and B1 still exist
        let a1 = Project::find_by_remote_project_id(&pool, swarm_project_a1)
            .await
            .unwrap();
        let b1 = Project::find_by_remote_project_id(&pool, swarm_project_b)
            .await
            .unwrap();
        assert!(a1.is_some());
        assert!(b1.is_some());

        // Verify A2 is gone
        let a2 = Project::find_by_remote_project_id(&pool, swarm_project_a2)
            .await
            .unwrap();
        assert!(a2.is_none());
    }
}
