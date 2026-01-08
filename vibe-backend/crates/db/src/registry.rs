//! Team Registry Database
//!
//! A lightweight registry database that tracks all team databases.
//! This enables multi-tenant database isolation where each team
//! has their own SQLite database file.

use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Sqlite, SqlitePool, sqlite::SqliteConnectOptions};
use std::str::FromStr;
use utils::assets::asset_dir;

/// Registry entry for a team's database
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TeamRegistry {
    pub id: String,           // Team UUID
    pub slug: String,         // Unique slug for DB naming (e.g., "acme-corp")
    pub name: String,         // Display name
    pub db_path: String,      // Local path: team-{slug}.sqlite
    pub turso_db: Option<String>, // Cloud DB: vibe-kanban-{slug}
    pub created_at: DateTime<Utc>,
    pub last_synced_at: Option<DateTime<Utc>>,
}

/// Input for creating a new team registry entry
#[derive(Debug, Deserialize)]
pub struct CreateTeamRegistry {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub turso_db: Option<String>,
}

/// Service for managing the team registry database
#[derive(Clone)]
pub struct RegistryService {
    pub pool: Pool<Postgres>,
}

impl RegistryService {
    /// Create a new registry service, initializing the registry database
    pub async fn new() -> Result<Self, sqlx::Error> {
        let database_url = crate::get_database_url();
        tracing::info!("Initializing team registry connection");

        let options = PgConnectOptions::from_str(&database_url)?;
       
        let pool = PgPool::connect_with(options).await?;

        // Create registry table if not exists
        // Note: Using Postgres syntax
        // Also: db_path is technically legacy now, but keeping schema consistent for now
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS team_registry (
                id TEXT PRIMARY KEY,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                db_path TEXT NOT NULL,
                turso_db TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_synced_at TIMESTAMPTZ
            )
            "#,
        )
        .execute(&pool)
        .await?;

        Ok(Self { pool })
    }

    /// Get the path to the registry database (Legacy/No-op for Postgres)
    pub fn get_registry_path() -> PathBuf {
        PathBuf::from("registry.sqlite") // Dummy
    }

    /// Get the path for a team's database based on slug (Legacy/No-op)
    pub fn get_team_db_path(slug: &str) -> PathBuf {
        PathBuf::from(format!("team-{}.sqlite", slug)) // Dummy
    }
    
    // ... (Other legacy file checks omitted or stubbed if necessary) ...

    /// Register a new team
    pub async fn create(&self, input: &CreateTeamRegistry) -> Result<TeamRegistry, sqlx::Error> {
        let db_path_str = format!("team-{}.sqlite", input.slug); // Legacy compat

        sqlx::query(
            r#"
            INSERT INTO team_registry (id, slug, name, db_path, turso_db, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            "#,
        )
        .bind(&input.id)
        .bind(&input.slug)
        .bind(&input.name)
        .bind(&db_path_str)
        .bind(&input.turso_db)
        .execute(&self.pool)
        .await?;

        self.find_by_id(&input.id).await?.ok_or(sqlx::Error::RowNotFound)
    }

    /// Find a team by ID
    pub async fn find_by_id(&self, id: &str) -> Result<Option<TeamRegistry>, sqlx::Error> {
        sqlx::query_as::<_, TeamRegistry>(
            "SELECT * FROM team_registry WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Find a team by slug
    pub async fn find_by_slug(&self, slug: &str) -> Result<Option<TeamRegistry>, sqlx::Error> {
        sqlx::query_as::<_, TeamRegistry>(
            "SELECT * FROM team_registry WHERE slug = $1",
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await
    }

    /// Get all registered teams
    pub async fn find_all(&self) -> Result<Vec<TeamRegistry>, sqlx::Error> {
        sqlx::query_as::<_, TeamRegistry>(
            "SELECT * FROM team_registry ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
    }

    /// Update last synced timestamp
    pub async fn update_last_synced(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE team_registry SET last_synced_at = NOW() WHERE id = $1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Update team name
    pub async fn update_name(&self, id: &str, name: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE team_registry SET name = $1 WHERE id = $2",
        )
        .bind(name)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Update Turso database name for a team
    pub async fn update_turso_db(&self, id: &str, turso_db: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE team_registry SET turso_db = $1 WHERE id = $2",
        )
        .bind(turso_db)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Get all teams with Turso configured
    pub async fn find_with_turso(&self) -> Result<Vec<TeamRegistry>, sqlx::Error> {
        sqlx::query_as::<_, TeamRegistry>(
            "SELECT * FROM team_registry WHERE turso_db IS NOT NULL ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
    }

    /// Delete a team from registry (does not delete database file)
    pub async fn delete(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM team_registry WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Check if a slug is already in use
    pub async fn slug_exists(&self, slug: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM team_registry WHERE slug = $1",
        )
        .bind(slug)
        .fetch_one(&self.pool)
        .await?;
        Ok(result > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_registry_crud() {
        // Use temp directory for test
        let temp_dir = TempDir::new().unwrap();
        std::env::set_var("VK_ASSET_DIR", temp_dir.path().to_string_lossy().to_string());

        let registry = RegistryService::new().await.unwrap();

        // Create
        let input = CreateTeamRegistry {
            id: "test-id-123".to_string(),
            slug: "acme-corp".to_string(),
            name: "Acme Corporation".to_string(),
            turso_db: Some("vibe-kanban-acme-corp".to_string()),
        };
        let team = registry.create(&input).await.unwrap();
        assert_eq!(team.slug, "acme-corp");

        // Find by ID
        let found = registry.find_by_id("test-id-123").await.unwrap();
        assert!(found.is_some());

        // Find by slug
        let found = registry.find_by_slug("acme-corp").await.unwrap();
        assert!(found.is_some());

        // Slug exists
        let exists = registry.slug_exists("acme-corp").await.unwrap();
        assert!(exists);

        // Delete
        registry.delete("test-id-123").await.unwrap();
        let found = registry.find_by_id("test-id-123").await.unwrap();
        assert!(found.is_none());
    }
}
