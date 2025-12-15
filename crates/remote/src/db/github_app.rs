use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum GitHubAppDbError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("installation not found")]
    NotFound,
    #[error("pending installation not found or expired")]
    PendingNotFound,
}

/// A GitHub App installation linked to an organization
#[derive(Debug, Clone, FromRow)]
pub struct GitHubAppInstallation {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub github_installation_id: i64,
    pub github_account_login: String,
    pub github_account_type: String,
    pub repository_selection: String,
    pub installed_by_user_id: Option<Uuid>,
    pub suspended_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A repository accessible via an installation
#[derive(Debug, Clone, FromRow)]
pub struct GitHubAppRepository {
    pub id: Uuid,
    pub installation_id: Uuid,
    pub github_repo_id: i64,
    pub repo_full_name: String,
    pub created_at: DateTime<Utc>,
}

/// A pending installation waiting for callback
#[derive(Debug, Clone, FromRow)]
pub struct PendingInstallation {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub state_token: String,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

pub struct GitHubAppRepository2<'a> {
    pool: &'a PgPool,
}

impl<'a> GitHubAppRepository2<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    // ========== Installations ==========

    pub async fn create_installation(
        &self,
        organization_id: Uuid,
        github_installation_id: i64,
        github_account_login: &str,
        github_account_type: &str,
        repository_selection: &str,
        installed_by_user_id: Uuid,
    ) -> Result<GitHubAppInstallation, GitHubAppDbError> {
        let installation = sqlx::query_as!(
            GitHubAppInstallation,
            r#"
            INSERT INTO github_app_installations (
                organization_id,
                github_installation_id,
                github_account_login,
                github_account_type,
                repository_selection,
                installed_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (github_installation_id) DO UPDATE SET
                organization_id = EXCLUDED.organization_id,
                github_account_login = EXCLUDED.github_account_login,
                github_account_type = EXCLUDED.github_account_type,
                repository_selection = EXCLUDED.repository_selection,
                installed_by_user_id = EXCLUDED.installed_by_user_id,
                suspended_at = NULL,
                updated_at = NOW()
            RETURNING
                id,
                organization_id,
                github_installation_id,
                github_account_login,
                github_account_type,
                repository_selection,
                installed_by_user_id,
                suspended_at,
                created_at,
                updated_at
            "#,
            organization_id,
            github_installation_id,
            github_account_login,
            github_account_type,
            repository_selection,
            installed_by_user_id
        )
        .fetch_one(self.pool)
        .await?;

        Ok(installation)
    }

    pub async fn get_by_github_id(
        &self,
        github_installation_id: i64,
    ) -> Result<Option<GitHubAppInstallation>, GitHubAppDbError> {
        let installation = sqlx::query_as!(
            GitHubAppInstallation,
            r#"
            SELECT
                id,
                organization_id,
                github_installation_id,
                github_account_login,
                github_account_type,
                repository_selection,
                installed_by_user_id,
                suspended_at,
                created_at,
                updated_at
            FROM github_app_installations
            WHERE github_installation_id = $1
            "#,
            github_installation_id
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(installation)
    }

    /// Find an installation by the GitHub account login (owner name)
    pub async fn get_by_account_login(
        &self,
        account_login: &str,
    ) -> Result<Option<GitHubAppInstallation>, GitHubAppDbError> {
        let installation = sqlx::query_as!(
            GitHubAppInstallation,
            r#"
            SELECT
                id,
                organization_id,
                github_installation_id,
                github_account_login,
                github_account_type,
                repository_selection,
                installed_by_user_id,
                suspended_at,
                created_at,
                updated_at
            FROM github_app_installations
            WHERE github_account_login = $1
            "#,
            account_login
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(installation)
    }

    pub async fn get_by_organization(
        &self,
        organization_id: Uuid,
    ) -> Result<Option<GitHubAppInstallation>, GitHubAppDbError> {
        let installation = sqlx::query_as!(
            GitHubAppInstallation,
            r#"
            SELECT
                id,
                organization_id,
                github_installation_id,
                github_account_login,
                github_account_type,
                repository_selection,
                installed_by_user_id,
                suspended_at,
                created_at,
                updated_at
            FROM github_app_installations
            WHERE organization_id = $1
            "#,
            organization_id
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(installation)
    }

    pub async fn delete_by_github_id(
        &self,
        github_installation_id: i64,
    ) -> Result<(), GitHubAppDbError> {
        sqlx::query!(
            r#"
            DELETE FROM github_app_installations
            WHERE github_installation_id = $1
            "#,
            github_installation_id
        )
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete_by_organization(
        &self,
        organization_id: Uuid,
    ) -> Result<(), GitHubAppDbError> {
        sqlx::query!(
            r#"
            DELETE FROM github_app_installations
            WHERE organization_id = $1
            "#,
            organization_id
        )
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn suspend(&self, github_installation_id: i64) -> Result<(), GitHubAppDbError> {
        sqlx::query!(
            r#"
            UPDATE github_app_installations
            SET suspended_at = NOW(), updated_at = NOW()
            WHERE github_installation_id = $1
            "#,
            github_installation_id
        )
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn unsuspend(&self, github_installation_id: i64) -> Result<(), GitHubAppDbError> {
        sqlx::query!(
            r#"
            UPDATE github_app_installations
            SET suspended_at = NULL, updated_at = NOW()
            WHERE github_installation_id = $1
            "#,
            github_installation_id
        )
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_repository_selection(
        &self,
        github_installation_id: i64,
        repository_selection: &str,
    ) -> Result<(), GitHubAppDbError> {
        sqlx::query!(
            r#"
            UPDATE github_app_installations
            SET repository_selection = $2, updated_at = NOW()
            WHERE github_installation_id = $1
            "#,
            github_installation_id,
            repository_selection
        )
        .execute(self.pool)
        .await?;

        Ok(())
    }

    // ========== Repositories ==========

    pub async fn sync_repositories(
        &self,
        installation_id: Uuid,
        repos: &[(i64, String)], // (github_repo_id, repo_full_name)
    ) -> Result<(), GitHubAppDbError> {
        // Delete all existing repos for this installation
        sqlx::query!(
            r#"
            DELETE FROM github_app_repositories
            WHERE installation_id = $1
            "#,
            installation_id
        )
        .execute(self.pool)
        .await?;

        // Insert new repos
        for (github_repo_id, repo_full_name) in repos {
            sqlx::query!(
                r#"
                INSERT INTO github_app_repositories (installation_id, github_repo_id, repo_full_name)
                VALUES ($1, $2, $3)
                ON CONFLICT (installation_id, github_repo_id) DO UPDATE SET
                    repo_full_name = EXCLUDED.repo_full_name
                "#,
                installation_id,
                github_repo_id,
                repo_full_name
            )
            .execute(self.pool)
            .await?;
        }

        Ok(())
    }

    pub async fn get_repositories(
        &self,
        installation_id: Uuid,
    ) -> Result<Vec<GitHubAppRepository>, GitHubAppDbError> {
        let repos = sqlx::query_as!(
            GitHubAppRepository,
            r#"
            SELECT
                id,
                installation_id,
                github_repo_id,
                repo_full_name,
                created_at
            FROM github_app_repositories
            WHERE installation_id = $1
            ORDER BY repo_full_name
            "#,
            installation_id
        )
        .fetch_all(self.pool)
        .await?;

        Ok(repos)
    }

    pub async fn add_repositories(
        &self,
        installation_id: Uuid,
        repos: &[(i64, String)],
    ) -> Result<(), GitHubAppDbError> {
        for (github_repo_id, repo_full_name) in repos {
            sqlx::query!(
                r#"
                INSERT INTO github_app_repositories (installation_id, github_repo_id, repo_full_name)
                VALUES ($1, $2, $3)
                ON CONFLICT (installation_id, github_repo_id) DO UPDATE SET
                    repo_full_name = EXCLUDED.repo_full_name
                "#,
                installation_id,
                github_repo_id,
                repo_full_name
            )
            .execute(self.pool)
            .await?;
        }

        Ok(())
    }

    pub async fn remove_repositories(
        &self,
        installation_id: Uuid,
        github_repo_ids: &[i64],
    ) -> Result<(), GitHubAppDbError> {
        sqlx::query!(
            r#"
            DELETE FROM github_app_repositories
            WHERE installation_id = $1 AND github_repo_id = ANY($2)
            "#,
            installation_id,
            github_repo_ids
        )
        .execute(self.pool)
        .await?;

        Ok(())
    }

    // ========== Pending Installations ==========

    pub async fn create_pending(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
        state_token: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<PendingInstallation, GitHubAppDbError> {
        // Delete any existing pending installation for this org
        sqlx::query!(
            r#"
            DELETE FROM github_app_pending_installations
            WHERE organization_id = $1
            "#,
            organization_id
        )
        .execute(self.pool)
        .await?;

        let pending = sqlx::query_as!(
            PendingInstallation,
            r#"
            INSERT INTO github_app_pending_installations (organization_id, user_id, state_token, expires_at)
            VALUES ($1, $2, $3, $4)
            RETURNING
                id,
                organization_id,
                user_id,
                state_token,
                expires_at,
                created_at
            "#,
            organization_id,
            user_id,
            state_token,
            expires_at
        )
        .fetch_one(self.pool)
        .await?;

        Ok(pending)
    }

    pub async fn get_pending_by_state(
        &self,
        state_token: &str,
    ) -> Result<Option<PendingInstallation>, GitHubAppDbError> {
        let pending = sqlx::query_as!(
            PendingInstallation,
            r#"
            SELECT
                id,
                organization_id,
                user_id,
                state_token,
                expires_at,
                created_at
            FROM github_app_pending_installations
            WHERE state_token = $1 AND expires_at > NOW()
            "#,
            state_token
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(pending)
    }

    pub async fn delete_pending(&self, state_token: &str) -> Result<(), GitHubAppDbError> {
        sqlx::query!(
            r#"
            DELETE FROM github_app_pending_installations
            WHERE state_token = $1
            "#,
            state_token
        )
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn cleanup_expired_pending(&self) -> Result<u64, GitHubAppDbError> {
        let result = sqlx::query!(
            r#"
            DELETE FROM github_app_pending_installations
            WHERE expires_at < NOW()
            "#
        )
        .execute(self.pool)
        .await?;

        Ok(result.rows_affected())
    }
}
