use chrono::{DateTime, Utc};
use git2::{BranchType, Repository};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub git_repo_path: String,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,

    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateProject {
    pub name: String,
    pub git_repo_path: String,
    pub use_existing_repo: bool,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub git_repo_path: Option<String>,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ProjectWithBranch {
    pub id: Uuid,
    pub name: String,
    pub git_repo_path: String,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub current_branch: Option<String>,

    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct SearchResult {
    pub path: String,
    pub is_file: bool,
    pub match_type: SearchMatchType,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub enum SearchMatchType {
    FileName,
    DirectoryName,
    FullPath,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    #[ts(type = "Date")]
    pub last_commit_date: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateBranch {
    pub name: String,
    pub base_branch: Option<String>,
}

impl Project {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>" FROM projects ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>" FROM projects WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_git_repo_path(
        pool: &SqlitePool,
        git_repo_path: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>" FROM projects WHERE git_repo_path = $1"#,
            git_repo_path
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_git_repo_path_excluding_id(
        pool: &SqlitePool,
        git_repo_path: &str,
        exclude_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>" FROM projects WHERE git_repo_path = $1 AND id != $2"#,
            git_repo_path,
            exclude_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateProject,
        project_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"INSERT INTO projects (id, name, git_repo_path, setup_script, dev_script, cleanup_script) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            project_id,
            data.name,
            data.git_repo_path,
            data.setup_script,
            data.dev_script,
            data.cleanup_script
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        name: String,
        git_repo_path: String,
        setup_script: Option<String>,
        dev_script: Option<String>,
        cleanup_script: Option<String>,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"UPDATE projects SET name = $2, git_repo_path = $3, setup_script = $4, dev_script = $5, cleanup_script = $6 WHERE id = $1 RETURNING id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            git_repo_path,
            setup_script,
            dev_script,
            cleanup_script
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM projects WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn exists(pool: &SqlitePool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            r#"
                SELECT COUNT(*) as "count!: i64"
                FROM projects
                WHERE id = $1
            "#,
            id
        )
        .fetch_one(pool)
        .await?;

        Ok(result.count > 0)
    }

    pub fn get_current_branch(&self) -> Result<String, git2::Error> {
        let repo = Repository::open(&self.git_repo_path)?;
        let head = repo.head()?;

        if let Some(branch_name) = head.shorthand() {
            Ok(branch_name.to_string())
        } else {
            Ok("HEAD".to_string())
        }
    }

    pub fn with_branch_info(self) -> ProjectWithBranch {
        let current_branch = self.get_current_branch().ok();

        ProjectWithBranch {
            id: self.id,
            name: self.name,
            git_repo_path: self.git_repo_path,
            setup_script: self.setup_script,
            dev_script: self.dev_script,
            cleanup_script: self.cleanup_script,
            current_branch,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }

    pub fn get_all_branches(&self) -> Result<Vec<GitBranch>, git2::Error> {
        let repo = Repository::open(&self.git_repo_path)?;
        let current_branch = self.get_current_branch().unwrap_or_default();
        let mut branches = Vec::new();

        // Helper function to get last commit date for a branch
        let get_last_commit_date = |branch: &git2::Branch| -> Result<DateTime<Utc>, git2::Error> {
            if let Some(target) = branch.get().target() {
                if let Ok(commit) = repo.find_commit(target) {
                    let timestamp = commit.time().seconds();
                    return Ok(DateTime::from_timestamp(timestamp, 0).unwrap_or_else(Utc::now));
                }
            }
            Ok(Utc::now()) // Default to now if we can't get the commit date
        };

        // Get local branches
        let local_branches = repo.branches(Some(BranchType::Local))?;
        for branch_result in local_branches {
            let (branch, _) = branch_result?;
            if let Some(name) = branch.name()? {
                let last_commit_date = get_last_commit_date(&branch)?;
                branches.push(GitBranch {
                    name: name.to_string(),
                    is_current: name == current_branch,
                    is_remote: false,
                    last_commit_date,
                });
            }
        }

        // Get remote branches
        let remote_branches = repo.branches(Some(BranchType::Remote))?;
        for branch_result in remote_branches {
            let (branch, _) = branch_result?;
            if let Some(name) = branch.name()? {
                // Skip remote HEAD references
                if !name.ends_with("/HEAD") {
                    let last_commit_date = get_last_commit_date(&branch)?;
                    branches.push(GitBranch {
                        name: name.to_string(),
                        is_current: false,
                        is_remote: true,
                        last_commit_date,
                    });
                }
            }
        }

        // Sort branches: current first, then by most recent commit date
        branches.sort_by(|a, b| {
            if a.is_current && !b.is_current {
                std::cmp::Ordering::Less
            } else if !a.is_current && b.is_current {
                std::cmp::Ordering::Greater
            } else {
                // Sort by most recent commit date (newest first)
                b.last_commit_date.cmp(&a.last_commit_date)
            }
        });

        Ok(branches)
    }

    pub fn create_branch(
        &self,
        branch_name: &str,
        base_branch: Option<&str>,
    ) -> Result<GitBranch, git2::Error> {
        let repo = Repository::open(&self.git_repo_path)?;

        // Get the base branch reference - default to current branch if not specified
        let base_branch_name = match base_branch {
            Some(name) => name.to_string(),
            None => self
                .get_current_branch()
                .unwrap_or_else(|_| "HEAD".to_string()),
        };

        // Find the base commit
        let base_commit = if base_branch_name == "HEAD" {
            repo.head()?.peel_to_commit()?
        } else {
            // Try to find the branch as local first, then remote
            let base_ref = if let Ok(local_ref) =
                repo.find_reference(&format!("refs/heads/{}", base_branch_name))
            {
                local_ref
            } else if let Ok(remote_ref) =
                repo.find_reference(&format!("refs/remotes/{}", base_branch_name))
            {
                remote_ref
            } else {
                return Err(git2::Error::from_str(&format!(
                    "Base branch '{}' not found",
                    base_branch_name
                )));
            };
            base_ref.peel_to_commit()?
        };

        // Create the new branch
        let _new_branch = repo.branch(branch_name, &base_commit, false)?;

        // Get the commit date for the new branch (same as base commit)
        let last_commit_date = {
            let timestamp = base_commit.time().seconds();
            DateTime::from_timestamp(timestamp, 0).unwrap_or_else(Utc::now)
        };

        Ok(GitBranch {
            name: branch_name.to_string(),
            is_current: false,
            is_remote: false,
            last_commit_date,
        })
    }
}
