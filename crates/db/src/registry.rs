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
    pub pool: Pool<Sqlite>,
}

impl RegistryService {
    /// Create a new registry service, initializing the registry database
    pub async fn new() -> Result<Self, sqlx::Error> {
        let registry_path = Self::get_registry_path();
        tracing::info!("Initializing team registry at: {}", registry_path.display());

        let database_url = format!("sqlite://{}", registry_path.to_string_lossy());
        let options = SqliteConnectOptions::from_str(&database_url)?
            .create_if_missing(true);

        let pool = SqlitePool::connect_with(options).await?;

        // Create registry table if not exists
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS team_registry (
                id TEXT PRIMARY KEY,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                db_path TEXT NOT NULL,
                turso_db TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                last_synced_at TEXT
            )
            "#,
        )
        .execute(&pool)
        .await?;

        Ok(Self { pool })
    }

    /// Get the path to the registry database
    pub fn get_registry_path() -> PathBuf {
        asset_dir().join("registry.sqlite")
    }

    /// Get the path for a team's database based on slug
    pub fn get_team_db_path(slug: &str) -> PathBuf {
        asset_dir().join(format!("team-{}.sqlite", slug))
    }

    /// Check if registry exists (for migration detection)
    pub fn registry_exists() -> bool {
        Self::get_registry_path().exists()
    }

    /// Check if legacy single database exists
    pub fn legacy_db_exists() -> bool {
        asset_dir().join("db.sqlite").exists()
    }

    /// Get legacy database path
    pub fn get_legacy_db_path() -> PathBuf {
        asset_dir().join("db.sqlite")
    }

    /// Register a new team
    pub async fn create(&self, input: &CreateTeamRegistry) -> Result<TeamRegistry, sqlx::Error> {
        let db_path = Self::get_team_db_path(&input.slug);
        let db_path_str = db_path.to_string_lossy().to_string();

        sqlx::query(
            r#"
            INSERT INTO team_registry (id, slug, name, db_path, turso_db, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
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
            "SELECT * FROM team_registry WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Find a team by slug
    pub async fn find_by_slug(&self, slug: &str) -> Result<Option<TeamRegistry>, sqlx::Error> {
        sqlx::query_as::<_, TeamRegistry>(
            "SELECT * FROM team_registry WHERE slug = ?",
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
            "UPDATE team_registry SET last_synced_at = datetime('now') WHERE id = ?",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Update team name
    pub async fn update_name(&self, id: &str, name: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE team_registry SET name = ? WHERE id = ?",
        )
        .bind(name)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Delete a team from registry (does not delete database file)
    pub async fn delete(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM team_registry WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Check if a slug is already in use
    pub async fn slug_exists(&self, slug: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM team_registry WHERE slug = ?",
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
