use std::{path::PathBuf, str::FromStr, sync::Arc};

use sqlx::{
    Error, Pool, Sqlite, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteConnection, SqlitePoolOptions},
};
use utils::assets::asset_dir;

pub mod libsql_db;
pub mod models;
pub mod pool_manager;
pub mod registry;
pub mod turso;

pub use libsql_db::{LibsqlDatabase, LibsqlDbError, LibsqlMode};
#[cfg(feature = "turso")]
pub use libsql_db::{FromLibsqlRow, row_helpers};
pub use pool_manager::{DBPoolManager, PoolManagerError};
pub use registry::{CreateTeamRegistry, RegistryService, TeamRegistry};
pub use turso::{TeamTursoError, TeamTursoManager, TursoConfig, TursoRemote, TursoRemoteConfig, TursoSync};

/// Database connection mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DatabaseMode {
    /// Local SQLite file (default for development)
    Local,
    /// Direct remote connection to Turso (for Fly.io/serverless)
    Remote,
    /// Embedded replica with Turso sync (for edge with offline support)
    Replica,
}

impl DatabaseMode {
    /// Get the database mode from environment variable
    /// DATABASE_MODE: "local" (default), "remote", or "replica"
    pub fn from_env() -> Self {
        match std::env::var("DATABASE_MODE").as_deref() {
            Ok("remote") => Self::Remote,
            Ok("replica") => Self::Replica,
            _ => Self::Local,
        }
    }

    /// Check if running in remote mode (stateless deployment)
    pub fn is_remote() -> bool {
        matches!(Self::from_env(), Self::Remote)
    }

    /// Check if running in local mode (development)
    pub fn is_local() -> bool {
        matches!(Self::from_env(), Self::Local)
    }
}

/// Get the database path, using Turso replica if configured
pub fn get_database_path() -> PathBuf {
    if TursoConfig::is_configured() {
        // Use Turso replica file (synced with cloud)
        asset_dir().join("db.turso.sqlite")
    } else {
        // Use local SQLite
        asset_dir().join("db.sqlite")
    }
}

#[derive(Clone)]
pub struct DBService {
    pub pool: Pool<Sqlite>,
}

impl DBService {
    pub async fn new() -> Result<DBService, Error> {
        let db_path = get_database_path();
        Self::new_with_path(db_path).await
    }

    pub async fn new_with_path(db_path: PathBuf) -> Result<DBService, Error> {
        let database_url = format!("sqlite://{}", db_path.to_string_lossy());
        tracing::info!("Connecting to database: {}", db_path.display());

        let options = SqliteConnectOptions::from_str(&database_url)?.create_if_missing(true);
        let pool = SqlitePool::connect_with(options).await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        Ok(DBService { pool })
    }

    pub async fn new_with_after_connect<F>(after_connect: F) -> Result<DBService, Error>
    where
        F: for<'a> Fn(
                &'a mut SqliteConnection,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<(), Error>> + Send + 'a>,
            > + Send
            + Sync
            + 'static,
    {
        let db_path = get_database_path();
        let pool = Self::create_pool(db_path, Some(Arc::new(after_connect))).await?;
        Ok(DBService { pool })
    }

    async fn create_pool<F>(db_path: PathBuf, after_connect: Option<Arc<F>>) -> Result<Pool<Sqlite>, Error>
    where
        F: for<'a> Fn(
                &'a mut SqliteConnection,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<(), Error>> + Send + 'a>,
            > + Send
            + Sync
            + 'static,
    {
        let database_url = format!("sqlite://{}", db_path.to_string_lossy());
        tracing::info!("Creating pool for database: {}", db_path.display());

        let options = SqliteConnectOptions::from_str(&database_url)?.create_if_missing(true);

        let pool = if let Some(hook) = after_connect {
            SqlitePoolOptions::new()
                .after_connect(move |conn, _meta| {
                    let hook = hook.clone();
                    Box::pin(async move {
                        hook(conn).await?;
                        Ok(())
                    })
                })
                .connect_with(options)
                .await?
        } else {
            SqlitePool::connect_with(options).await?
        };

        sqlx::migrate!("./migrations").run(&pool).await?;
        Ok(pool)
    }
}
