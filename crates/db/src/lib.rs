use std::{str::FromStr, sync::Arc};

use sqlx::{
    ConnectOptions, Error, Pool, Sqlite, SqlitePool,
    migrate::MigrateError,
    sqlite::{SqliteConnectOptions, SqliteConnection, SqliteJournalMode, SqlitePoolOptions},
};
use utils::assets::asset_dir;

pub mod models;

async fn run_migrations(pool: &Pool<Sqlite>) -> Result<(), Error> {
    use std::collections::HashSet;

    let migrator = sqlx::migrate!("./migrations");
    let mut processed_versions: HashSet<i64> = HashSet::new();

    loop {
        match migrator.run(pool).await {
            Ok(()) => return Ok(()),
            Err(MigrateError::VersionMismatch(version)) => {
                if cfg!(debug_assertions) {
                    // return the error in debug mode to catch migration issues early
                    return Err(sqlx::Error::Migrate(Box::new(
                        MigrateError::VersionMismatch(version),
                    )));
                }

                if !cfg!(windows) {
                    // On non-Windows platforms, we do not attempt to auto-fix checksum mismatches
                    return Err(sqlx::Error::Migrate(Box::new(
                        MigrateError::VersionMismatch(version),
                    )));
                }

                // Guard against infinite loop
                if !processed_versions.insert(version) {
                    return Err(sqlx::Error::Migrate(Box::new(
                        MigrateError::VersionMismatch(version),
                    )));
                }

                // On Windows, there can be checksum mismatches due to line ending differences
                // or other platform-specific issues. Update the stored checksum and retry.
                tracing::warn!(
                    "Migration version {} has checksum mismatch, updating stored checksum (likely platform-specific difference)",
                    version
                );

                // Find the migration with the mismatched version and get its current checksum
                if let Some(migration) = migrator.iter().find(|m| m.version == version) {
                    // Update the checksum in _sqlx_migrations to match the current file
                    sqlx::query("UPDATE _sqlx_migrations SET checksum = ? WHERE version = ?")
                        .bind(&*migration.checksum)
                        .bind(version)
                        .execute(pool)
                        .await?;
                } else {
                    // Migration not found in current set, can't fix
                    return Err(sqlx::Error::Migrate(Box::new(
                        MigrateError::VersionMismatch(version),
                    )));
                }
            }
            Err(e) => return Err(e.into()),
        }
    }
}

#[derive(Clone)]
pub struct DBService {
    pub pool: Pool<Sqlite>,
}

impl DBService {
    pub async fn new() -> Result<DBService, Error> {
        let database_url = format!(
            "sqlite://{}",
            asset_dir().join("db.v2.sqlite").to_string_lossy()
        );
        let options = SqliteConnectOptions::from_str(&database_url)?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Delete);
        let pool = SqlitePool::connect_with(options).await?;
        run_migrations(&pool).await?;
        Ok(DBService { pool })
    }

    pub async fn new_migration_pool() -> Result<Pool<Sqlite>, Error> {
        let database_url = format!(
            "sqlite://{}",
            asset_dir().join("db.v2.sqlite").to_string_lossy()
        );
        let options = SqliteConnectOptions::from_str(&database_url)?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Delete)
            .disable_statement_logging();
        SqlitePoolOptions::new()
            .max_connections(64)
            .connect_with(options)
            .await
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
        let pool = Self::create_pool(Some(Arc::new(after_connect))).await?;
        Ok(DBService { pool })
    }

    async fn create_pool<F>(after_connect: Option<Arc<F>>) -> Result<Pool<Sqlite>, Error>
    where
        F: for<'a> Fn(
                &'a mut SqliteConnection,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<(), Error>> + Send + 'a>,
            > + Send
            + Sync
            + 'static,
    {
        let database_url = format!(
            "sqlite://{}",
            asset_dir().join("db.v2.sqlite").to_string_lossy()
        );
        let options = SqliteConnectOptions::from_str(&database_url)?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Delete);

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

        run_migrations(&pool).await?;
        Ok(pool)
    }
}
