pub mod activity;
pub mod auth;
pub mod identity_errors;
pub mod invitations;
pub mod listener;
pub mod maintenance;
pub mod oauth;
pub mod oauth_accounts;
pub mod organization_members;
pub mod organizations;
pub mod projects;
pub mod tasks;
pub mod users;

pub use listener::ActivityListener;
use sqlx::{PgPool, Postgres, Transaction, migrate::MigrateError, postgres::PgPoolOptions};

pub(crate) type Tx<'a> = Transaction<'a, Postgres>;

pub(crate) async fn migrate(pool: &PgPool) -> Result<(), MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

pub(crate) async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}
