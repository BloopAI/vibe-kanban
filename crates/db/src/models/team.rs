use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Team {
    pub id: Uuid,
    pub name: String,
    pub identifier: Option<String>, // Team prefix for issue IDs (e.g., "VIB")
    pub icon: Option<String>,
    pub color: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TeamProject {
    pub team_id: Uuid,
    pub project_id: Uuid,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTeam {
    pub name: String,
    pub identifier: Option<String>, // If not provided, auto-generated from name
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTeam {
    pub name: Option<String>,
    pub identifier: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct TeamProjectAssignment {
    pub project_id: Uuid,
}

/// Generate a team identifier from the team name
/// Takes first 3-4 uppercase letters (preference for consonants)
fn generate_identifier(name: &str) -> String {
    let name_upper = name.to_uppercase();
    let chars: Vec<char> = name_upper.chars().filter(|c| c.is_alphabetic()).collect();

    if chars.is_empty() {
        return "TEAM".to_string();
    }

    // Take first 3-4 characters, preferring to stop at a natural boundary
    let len = chars.len().min(4);
    if len <= 3 {
        chars.into_iter().collect()
    } else {
        chars.into_iter().take(3).collect()
    }
}

impl Team {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Team,
            r#"SELECT id as "id!: Uuid",
                      name,
                      identifier,
                      icon,
                      color,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM teams
               ORDER BY name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Team,
            r#"SELECT id as "id!: Uuid",
                      name,
                      identifier,
                      icon,
                      color,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM teams
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateTeam) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        // Use provided identifier or auto-generate from name
        let identifier = data
            .identifier
            .clone()
            .unwrap_or_else(|| generate_identifier(&data.name));

        sqlx::query_as!(
            Team,
            r#"INSERT INTO teams (id, name, identifier, icon, color)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id as "id!: Uuid",
                         name,
                         identifier,
                         icon,
                         color,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.name,
            identifier,
            data.icon,
            data.color
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateTeam,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = data.name.as_ref().unwrap_or(&existing.name);
        let identifier = data.identifier.clone().or(existing.identifier);
        let icon = data.icon.clone().or(existing.icon);
        let color = data.color.clone().or(existing.color);

        sqlx::query_as!(
            Team,
            r#"UPDATE teams
               SET name = $2, identifier = $3, icon = $4, color = $5, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         name,
                         identifier,
                         icon,
                         color,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            identifier,
            icon,
            color
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM teams WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Get all projects assigned to this team
    pub async fn get_projects(pool: &SqlitePool, team_id: Uuid) -> Result<Vec<Uuid>, sqlx::Error> {
        let rows = sqlx::query_scalar!(
            r#"SELECT project_id as "project_id!: Uuid"
               FROM team_projects
               WHERE team_id = $1"#,
            team_id
        )
        .fetch_all(pool)
        .await?;
        Ok(rows)
    }

    /// Assign a project to this team
    pub async fn assign_project(
        pool: &SqlitePool,
        team_id: Uuid,
        project_id: Uuid,
    ) -> Result<TeamProject, sqlx::Error> {
        sqlx::query_as!(
            TeamProject,
            r#"INSERT INTO team_projects (team_id, project_id)
               VALUES ($1, $2)
               ON CONFLICT (team_id, project_id) DO UPDATE SET team_id = team_id
               RETURNING team_id as "team_id!: Uuid",
                         project_id as "project_id!: Uuid",
                         created_at as "created_at!: DateTime<Utc>""#,
            team_id,
            project_id
        )
        .fetch_one(pool)
        .await
    }

    /// Remove a project from this team
    pub async fn remove_project(
        pool: &SqlitePool,
        team_id: Uuid,
        project_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM team_projects WHERE team_id = $1 AND project_id = $2",
            team_id,
            project_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Get all teams that a project belongs to
    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Team,
            r#"SELECT t.id as "id!: Uuid",
                      t.name,
                      t.identifier,
                      t.icon,
                      t.color,
                      t.created_at as "created_at!: DateTime<Utc>",
                      t.updated_at as "updated_at!: DateTime<Utc>"
               FROM teams t
               INNER JOIN team_projects tp ON t.id = tp.team_id
               WHERE tp.project_id = $1
               ORDER BY t.name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    /// Get the next issue number for a team
    pub async fn get_next_issue_number(pool: &SqlitePool, team_id: Uuid) -> Result<i32, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT COALESCE(MAX(issue_number), 0) + 1 as "next_number!: i32"
               FROM tasks
               WHERE team_id = $1"#,
            team_id
        )
        .fetch_one(pool)
        .await?;
        Ok(result)
    }
}
