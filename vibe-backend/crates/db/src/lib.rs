//! DB crate for iKanban - Migration to Postgres
use std::{str::FromStr, sync::Arc, time::Duration};

use sqlx::{
    Error, Pool, Postgres, PgPool,
    postgres::{PgConnectOptions, PgPoolOptions},
};
// use utils::assets::asset_dir; // No longer needed for Postgres

pub mod models;
pub mod pool_manager;
pub mod registry;

pub use pool_manager::{DBPoolManager, PoolManagerError};
pub use registry::{CreateTeamRegistry, RegistryService, TeamRegistry};

/// Get the database URL
/// Reads DATABASE_URL env var
pub fn get_database_url() -> String {
    std::env::var("DATABASE_URL").expect("DATABASE_URL must be set")
}

#[derive(Clone)]
pub struct DBService {
    pub pool: Pool<Postgres>,
}

impl DBService {
    pub async fn new() -> Result<DBService, Error> {
        let database_url = get_database_url();
        Self::new_with_url(&database_url).await
    }

    pub async fn new_with_url(database_url: &str) -> Result<DBService, Error> {
        tracing::info!("Connecting to database: {}", database_url);

        let options = PgConnectOptions::from_str(database_url)?;
        // .create_if_missing(true) is not available/needed for Postgres connection string usually
        
        // Use a reasonable connection timeout
        let pool = PgPool::connect_with(options).await?;
        
        // Disable sqlx migrations as we use Drizzle now
        // sqlx::migrate!("./migrations").run(&pool).await?;
        
        Ok(DBService { pool })
    }

    pub async fn new_with_after_connect<F>(after_connect: F) -> Result<DBService, Error>
    where
        F: for<'a> Fn(
                &'a mut sqlx::PgConnection,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<(), Error>> + Send + 'a>,
            > + Send
            + Sync
            + 'static,
    {
        let database_url = get_database_url();
        let pool = Self::create_pool(&database_url, Some(Arc::new(after_connect))).await?;
        Ok(DBService { pool })
    }

    async fn create_pool<F>(database_url: &str, after_connect: Option<Arc<F>>) -> Result<Pool<Postgres>, Error>
    where
        F: for<'a> Fn(
                &'a mut sqlx::PgConnection,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<(), Error>> + Send + 'a>,
            > + Send
            + Sync
            + 'static,
    {
        tracing::info!("Creating pool for database"); // Don't log full URL to avoid leaking passwords

        let options = PgConnectOptions::from_str(database_url)?;

        // Configure pool options for rate limiting protection
        // - max_connections: Limit concurrent connections to avoid overwhelming Supabase
        // - acquire_timeout: Timeout when waiting for a connection from the pool
        // - idle_timeout: Close idle connections to free up Supabase connection slots
        let pool_options = PgPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(Duration::from_secs(30))
            .idle_timeout(Duration::from_secs(600));

        let pool = if let Some(hook) = after_connect {
            pool_options
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
            pool_options.connect_with(options).await?
        };

        // sqlx::migrate!("./migrations").run(&pool).await?;
        Ok(pool)
    }
}
