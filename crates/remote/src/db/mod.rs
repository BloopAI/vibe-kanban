pub mod auth;
pub mod github_app;
pub mod identity_errors;
pub mod invitations;
pub mod issue_assignees;
pub mod issue_comment_reactions;
pub mod issue_comments;
pub mod issue_followers;
pub mod issue_relationships;
pub mod issue_tags;
pub mod issues;
pub mod notifications;
pub mod oauth;
pub mod oauth_accounts;
pub mod organization_members;
pub mod organizations;
pub mod project_notification_preferences;
pub mod project_statuses;
pub mod projects;
pub mod reviews;
pub mod tags;
pub mod types;
pub mod users;
pub mod workspaces;

use sqlx::{
    Executor, PgPool, Postgres, Transaction, migrate::MigrateError, postgres::PgPoolOptions,
};

pub(crate) type Tx<'a> = Transaction<'a, Postgres>;

/// Get the current transaction ID from Postgres.
/// Must be called within an active transaction.
/// Uses text conversion to avoid xid8->bigint cast issues in some PG versions.
pub async fn get_txid<'e, E>(executor: E) -> Result<i64, sqlx::Error>
where
    E: Executor<'e, Database = Postgres>,
{
    let row: (i64,) = sqlx::query_as("SELECT pg_current_xact_id()::text::bigint")
        .fetch_one(executor)
        .await?;
    Ok(row.0)
}

pub(crate) async fn migrate(pool: &PgPool) -> Result<(), MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

pub(crate) async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}

pub(crate) async fn ensure_electric_role_password(
    pool: &PgPool,
    password: &str,
) -> Result<(), sqlx::Error> {
    if password.is_empty() {
        return Ok(());
    }

    // PostgreSQL doesn't support parameter binding for ALTER ROLE PASSWORD
    // We need to escape the password properly and embed it directly in the SQL
    let escaped_password = password.replace("'", "''");
    let sql = format!("ALTER ROLE electric_sync WITH PASSWORD '{escaped_password}'");

    sqlx::query(&sql).execute(pool).await?;

    Ok(())
}
