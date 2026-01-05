//! LibSQL Database abstraction for local and remote connections.
//!
//! This module provides a unified database interface that works with:
//! - Local SQLite files (development)
//! - Remote Turso connections (production)
//! - Embedded replicas (edge deployments)
//!
//! By using libsql exclusively, we avoid linker conflicts between
//! libsqlite3-sys (SQLx) and libsql-ffi (Turso).

use std::path::PathBuf;
use std::sync::Arc;
use thiserror::Error;

#[cfg(feature = "turso")]
use libsql::{Builder, Connection, Database, Row, Rows, Value};

/// Database connection mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LibsqlMode {
    /// Local SQLite file (default for development)
    Local,
    /// Direct remote connection to Turso (for Fly.io/serverless)
    Remote,
    /// Embedded replica with Turso sync (for edge with offline support)
    Replica,
}

impl LibsqlMode {
    /// Get the database mode from environment variable
    /// DATABASE_MODE: "local" (default), "remote", or "replica"
    pub fn from_env() -> Self {
        match std::env::var("DATABASE_MODE").as_deref() {
            Ok("remote") => Self::Remote,
            Ok("replica") => Self::Replica,
            _ => Self::Local,
        }
    }
}

/// Errors that can occur with LibsqlDatabase
#[derive(Error, Debug)]
pub enum LibsqlDbError {
    #[error("libsql error: {0}")]
    #[cfg(feature = "turso")]
    Libsql(#[from] libsql::Error),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Migration error: {0}")]
    Migration(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Row not found")]
    RowNotFound,

    #[error("Feature not enabled: turso feature required")]
    FeatureNotEnabled,
}

/// LibSQL Database wrapper that provides a unified interface
/// for local and remote database connections.
#[cfg(feature = "turso")]
#[derive(Clone)]
pub struct LibsqlDatabase {
    db: Arc<Database>,
    mode: LibsqlMode,
}

#[cfg(feature = "turso")]
impl LibsqlDatabase {
    /// Create a new local database connection (for development)
    ///
    /// This creates a local SQLite file using libsql's embedded engine.
    /// No network connection required.
    pub async fn new_local(path: impl Into<PathBuf>) -> Result<Self, LibsqlDbError> {
        let path = path.into();
        tracing::info!("Opening local libsql database: {}", path.display());

        let db = Builder::new_local(path.to_string_lossy().to_string())
            .build()
            .await?;

        Ok(Self {
            db: Arc::new(db),
            mode: LibsqlMode::Local,
        })
    }

    /// Create a new remote database connection (for production/Fly.io)
    ///
    /// This connects directly to Turso cloud. No local file needed.
    pub async fn new_remote(url: &str, token: &str) -> Result<Self, LibsqlDbError> {
        tracing::info!("Connecting to remote Turso database");

        let db = Builder::new_remote(url.to_string(), token.to_string())
            .build()
            .await?;

        Ok(Self {
            db: Arc::new(db),
            mode: LibsqlMode::Remote,
        })
    }

    /// Create a new embedded replica (for edge with offline support)
    ///
    /// This maintains a local copy that syncs with Turso cloud.
    pub async fn new_replica(
        local_path: impl Into<PathBuf>,
        url: &str,
        token: &str,
    ) -> Result<Self, LibsqlDbError> {
        let local_path = local_path.into();
        tracing::info!(
            "Opening embedded replica at {} syncing to Turso",
            local_path.display()
        );

        let db = Builder::new_remote_replica(
            local_path.to_string_lossy().to_string(),
            url.to_string(),
            token.to_string(),
        )
        .build()
        .await?;

        // Perform initial sync
        tracing::info!("Performing initial sync...");
        db.sync().await?;

        Ok(Self {
            db: Arc::new(db),
            mode: LibsqlMode::Replica,
        })
    }

    /// Create database from environment configuration
    ///
    /// Uses DATABASE_MODE env var to determine connection type:
    /// - "local" (default): Uses DATABASE_PATH or default location
    /// - "remote": Uses TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
    /// - "replica": Uses all three
    pub async fn from_env(default_path: impl Into<PathBuf>) -> Result<Self, LibsqlDbError> {
        let mode = LibsqlMode::from_env();
        let default_path = default_path.into();

        match mode {
            LibsqlMode::Local => {
                let path = std::env::var("DATABASE_PATH")
                    .map(PathBuf::from)
                    .unwrap_or(default_path);
                Self::new_local(path).await
            }
            LibsqlMode::Remote => {
                let url = std::env::var("TURSO_DATABASE_URL")
                    .map_err(|_| LibsqlDbError::Config("TURSO_DATABASE_URL not set".to_string()))?;
                let token = std::env::var("TURSO_AUTH_TOKEN")
                    .map_err(|_| LibsqlDbError::Config("TURSO_AUTH_TOKEN not set".to_string()))?;
                Self::new_remote(&url, &token).await
            }
            LibsqlMode::Replica => {
                let path = std::env::var("DATABASE_PATH")
                    .map(PathBuf::from)
                    .unwrap_or(default_path);
                let url = std::env::var("TURSO_DATABASE_URL")
                    .map_err(|_| LibsqlDbError::Config("TURSO_DATABASE_URL not set".to_string()))?;
                let token = std::env::var("TURSO_AUTH_TOKEN")
                    .map_err(|_| LibsqlDbError::Config("TURSO_AUTH_TOKEN not set".to_string()))?;
                Self::new_replica(path, &url, &token).await
            }
        }
    }

    /// Get a connection from the database
    pub fn connect(&self) -> Result<Connection, LibsqlDbError> {
        Ok(self.db.connect()?)
    }

    /// Get the current mode
    pub fn mode(&self) -> LibsqlMode {
        self.mode
    }

    /// Sync with Turso (only for replica mode)
    pub async fn sync(&self) -> Result<(), LibsqlDbError> {
        if self.mode == LibsqlMode::Replica {
            self.db.sync().await?;
        }
        Ok(())
    }

    /// Execute a query and return rows affected
    pub async fn execute(&self, sql: &str, params: impl libsql::params::IntoParams) -> Result<u64, LibsqlDbError> {
        let conn = self.connect()?;
        let rows_affected = conn.execute(sql, params).await?;
        Ok(rows_affected)
    }

    /// Execute a query and return rows
    pub async fn query(&self, sql: &str, params: impl libsql::params::IntoParams) -> Result<Rows, LibsqlDbError> {
        let conn = self.connect()?;
        let rows = conn.query(sql, params).await?;
        Ok(rows)
    }

    /// Execute a query and return a single optional row
    pub async fn query_one(&self, sql: &str, params: impl libsql::params::IntoParams) -> Result<Option<Row>, LibsqlDbError> {
        let conn = self.connect()?;
        let mut rows = conn.query(sql, params).await?;
        Ok(rows.next().await?)
    }

    /// Run migrations from SQL files
    ///
    /// This reads migration files and executes them in order.
    /// Uses a simple _libsql_migrations table to track applied migrations.
    pub async fn run_migrations(&self, migrations_dir: &str) -> Result<(), LibsqlDbError> {
        let conn = self.connect()?;

        // Create migrations table if not exists
        conn.execute(
            "CREATE TABLE IF NOT EXISTS _libsql_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            (),
        )
        .await?;

        // Read migration files from directory
        let migrations_path = std::path::Path::new(migrations_dir);
        if !migrations_path.exists() {
            tracing::warn!("Migrations directory not found: {}", migrations_dir);
            return Ok(());
        }

        let mut entries: Vec<_> = std::fs::read_dir(migrations_path)
            .map_err(|e| LibsqlDbError::Migration(e.to_string()))?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|ext| ext == "sql").unwrap_or(false))
            .collect();

        // Sort by filename (migration timestamp)
        entries.sort_by_key(|e| e.file_name());

        for entry in entries {
            let filename = entry.file_name().to_string_lossy().to_string();
            let version = filename.trim_end_matches(".sql");

            // Check if already applied
            let mut rows = conn
                .query(
                    "SELECT version FROM _libsql_migrations WHERE version = ?",
                    [version],
                )
                .await?;

            if rows.next().await?.is_some() {
                tracing::debug!("Migration {} already applied", version);
                continue;
            }

            // Read and execute migration
            let sql = std::fs::read_to_string(entry.path())
                .map_err(|e| LibsqlDbError::Migration(format!("Failed to read {}: {}", filename, e)))?;

            tracing::info!("Applying migration: {}", filename);

            // Execute migration (may contain multiple statements)
            for statement in sql.split(';').filter(|s| !s.trim().is_empty()) {
                conn.execute(statement, ()).await.map_err(|e| {
                    LibsqlDbError::Migration(format!("Migration {} failed: {}", filename, e))
                })?;
            }

            // Record migration
            conn.execute(
                "INSERT INTO _libsql_migrations (version) VALUES (?)",
                [version],
            )
            .await?;

            tracing::info!("Migration {} applied successfully", filename);
        }

        Ok(())
    }
}

/// Stub implementation when turso feature is disabled
#[cfg(not(feature = "turso"))]
#[derive(Clone)]
pub struct LibsqlDatabase;

#[cfg(not(feature = "turso"))]
impl LibsqlDatabase {
    pub async fn new_local(_path: impl Into<PathBuf>) -> Result<Self, LibsqlDbError> {
        Err(LibsqlDbError::FeatureNotEnabled)
    }

    pub async fn new_remote(_url: &str, _token: &str) -> Result<Self, LibsqlDbError> {
        Err(LibsqlDbError::FeatureNotEnabled)
    }

    pub async fn from_env(_default_path: impl Into<PathBuf>) -> Result<Self, LibsqlDbError> {
        Err(LibsqlDbError::FeatureNotEnabled)
    }
}

/// Helper trait for converting libsql rows to structs
#[cfg(feature = "turso")]
pub trait FromLibsqlRow: Sized {
    /// Convert a libsql row to this type
    fn from_row(row: &Row) -> Result<Self, LibsqlDbError>;
}

/// Helper to convert libsql Value to common types
#[cfg(feature = "turso")]
pub mod row_helpers {
    use super::*;
    use chrono::{DateTime, Utc};
    use uuid::Uuid;

    /// Get a required string from a row by column index
    pub fn get_string(row: &Row, idx: i32) -> Result<String, LibsqlDbError> {
        row.get::<String>(idx)
            .map_err(|e| LibsqlDbError::Parse(format!("Failed to get string at {}: {}", idx, e)))
    }

    /// Get an optional string from a row by column index
    pub fn get_optional_string(row: &Row, idx: i32) -> Result<Option<String>, LibsqlDbError> {
        match row.get_value(idx) {
            Ok(Value::Null) => Ok(None),
            Ok(Value::Text(s)) => Ok(Some(s)),
            Ok(Value::Integer(i)) => Ok(Some(i.to_string())),
            Ok(Value::Real(f)) => Ok(Some(f.to_string())),
            Ok(Value::Blob(b)) => Ok(Some(format!("{:?}", b))),
            Err(e) => Err(LibsqlDbError::Parse(format!("Failed to get optional string at {}: {}", idx, e))),
        }
    }

    /// Get a required UUID from a row by column index (stored as TEXT)
    pub fn get_uuid(row: &Row, idx: i32) -> Result<Uuid, LibsqlDbError> {
        let s = get_string(row, idx)?;
        Uuid::parse_str(&s)
            .map_err(|e| LibsqlDbError::Parse(format!("Invalid UUID at {}: {}", idx, e)))
    }

    /// Get an optional UUID from a row by column index
    pub fn get_optional_uuid(row: &Row, idx: i32) -> Result<Option<Uuid>, LibsqlDbError> {
        match get_optional_string(row, idx)? {
            Some(s) if !s.is_empty() => {
                Uuid::parse_str(&s)
                    .map(Some)
                    .map_err(|e| LibsqlDbError::Parse(format!("Invalid UUID at {}: {}", idx, e)))
            }
            _ => Ok(None),
        }
    }

    /// Get a required i32 from a row by column index
    pub fn get_i32(row: &Row, idx: i32) -> Result<i32, LibsqlDbError> {
        row.get::<i32>(idx)
            .map_err(|e| LibsqlDbError::Parse(format!("Failed to get i32 at {}: {}", idx, e)))
    }

    /// Get an optional i32 from a row by column index
    pub fn get_optional_i32(row: &Row, idx: i32) -> Result<Option<i32>, LibsqlDbError> {
        match row.get_value(idx) {
            Ok(Value::Null) => Ok(None),
            Ok(Value::Integer(i)) => Ok(Some(i as i32)),
            Ok(v) => Err(LibsqlDbError::Parse(format!("Expected i32 at {}, got {:?}", idx, v))),
            Err(e) => Err(LibsqlDbError::Parse(format!("Failed to get optional i32 at {}: {}", idx, e))),
        }
    }

    /// Get a required i64 from a row by column index
    pub fn get_i64(row: &Row, idx: i32) -> Result<i64, LibsqlDbError> {
        row.get::<i64>(idx)
            .map_err(|e| LibsqlDbError::Parse(format!("Failed to get i64 at {}: {}", idx, e)))
    }

    /// Get an optional i64 from a row by column index
    pub fn get_optional_i64(row: &Row, idx: i32) -> Result<Option<i64>, LibsqlDbError> {
        match row.get_value(idx) {
            Ok(Value::Null) => Ok(None),
            Ok(Value::Integer(i)) => Ok(Some(i)),
            Ok(v) => Err(LibsqlDbError::Parse(format!("Expected i64 at {}, got {:?}", idx, v))),
            Err(e) => Err(LibsqlDbError::Parse(format!("Failed to get optional i64 at {}: {}", idx, e))),
        }
    }

    /// Get a required bool from a row by column index (stored as INTEGER 0/1)
    pub fn get_bool(row: &Row, idx: i32) -> Result<bool, LibsqlDbError> {
        let i = get_i64(row, idx)?;
        Ok(i != 0)
    }

    /// Get an optional bool from a row by column index
    pub fn get_optional_bool(row: &Row, idx: i32) -> Result<Option<bool>, LibsqlDbError> {
        match get_optional_i64(row, idx)? {
            Some(i) => Ok(Some(i != 0)),
            None => Ok(None),
        }
    }

    /// Get a required DateTime<Utc> from a row by column index
    pub fn get_datetime(row: &Row, idx: i32) -> Result<DateTime<Utc>, LibsqlDbError> {
        let s = get_string(row, idx)?;
        // Try multiple formats
        if let Ok(dt) = DateTime::parse_from_rfc3339(&s) {
            return Ok(dt.with_timezone(&Utc));
        }
        // SQLite default format
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S") {
            return Ok(DateTime::from_naive_utc_and_offset(dt, Utc));
        }
        // ISO format without timezone
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S") {
            return Ok(DateTime::from_naive_utc_and_offset(dt, Utc));
        }
        // ISO format with fractional seconds
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S%.f") {
            return Ok(DateTime::from_naive_utc_and_offset(dt, Utc));
        }
        Err(LibsqlDbError::Parse(format!("Invalid datetime at {}: {}", idx, s)))
    }

    /// Get an optional DateTime<Utc> from a row by column index
    pub fn get_optional_datetime(row: &Row, idx: i32) -> Result<Option<DateTime<Utc>>, LibsqlDbError> {
        match get_optional_string(row, idx)? {
            Some(s) if !s.is_empty() => {
                // Try multiple formats
                if let Ok(dt) = DateTime::parse_from_rfc3339(&s) {
                    return Ok(Some(dt.with_timezone(&Utc)));
                }
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S") {
                    return Ok(Some(DateTime::from_naive_utc_and_offset(dt, Utc)));
                }
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S") {
                    return Ok(Some(DateTime::from_naive_utc_and_offset(dt, Utc)));
                }
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%dT%H:%M:%S%.f") {
                    return Ok(Some(DateTime::from_naive_utc_and_offset(dt, Utc)));
                }
                Err(LibsqlDbError::Parse(format!("Invalid datetime at {}: {}", idx, s)))
            }
            _ => Ok(None),
        }
    }
}

#[cfg(all(test, feature = "turso"))]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_local_database_creation() {
        let temp_dir = std::env::temp_dir();
        let db_path = temp_dir.join("test_libsql.db");

        // Clean up if exists
        let _ = std::fs::remove_file(&db_path);

        let result = LibsqlDatabase::new_local(&db_path).await;
        assert!(result.is_ok());

        let db = result.unwrap();
        assert_eq!(db.mode(), LibsqlMode::Local);

        // Test basic query
        let conn = db.connect().unwrap();
        conn.execute("CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY)", ())
            .await
            .unwrap();

        // Clean up
        let _ = std::fs::remove_file(&db_path);
    }
}
