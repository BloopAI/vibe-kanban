pub mod auth_sessions;
pub mod hosts;
pub mod identity_errors;
pub mod relay_auth_codes;
pub mod relay_browser_sessions;
pub mod users;

use sqlx::{PgPool, postgres::PgPoolOptions};

pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}
