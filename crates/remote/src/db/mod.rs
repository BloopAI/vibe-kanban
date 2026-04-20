pub mod attachments;
pub mod auth;
pub mod blobs;
pub mod digest;
pub mod electric_publications;
pub mod export;
pub mod github_app;
pub mod hosts;
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
pub mod pending_uploads;
pub mod project_notification_preferences;
pub mod project_statuses;
pub mod projects;
pub mod pull_request_issues;
pub mod pull_requests;
pub mod reviews;
pub mod tags;
pub mod types;
pub mod users;
pub mod workspaces;

use sqlx::{
    Executor, PgPool, Postgres, Transaction,
    migrate::MigrateError,
    postgres::{PgConnectOptions, PgPoolOptions},
};
use uuid::Uuid;

pub(crate) type Tx<'a> = Transaction<'a, Postgres>;

/// Per-request context propagated to database transactions via a tokio task-local.
/// The auth middleware initialises the scope; `begin_tx` reads it.
#[derive(Clone)]
pub struct TxContext {
    pub user_id: Uuid,
    pub request_id: String,
}

tokio::task_local! {
    pub static TX_CONTEXT: Option<TxContext>;
}

/// Begin a transaction and tag it with the current request's request ID.
/// If no context is set (e.g. background jobs), the transaction is untagged.
pub async fn begin_tx(pool: &PgPool) -> Result<Tx<'_>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let ctx = TX_CONTEXT.try_with(|c| c.clone()).ok().flatten();
    if let Some(ctx) = ctx {
        let name = format!("vk r:{}", ctx.request_id.replace('-', ""));
        sqlx::query("SELECT set_config('application_name', $1, true)")
            .bind(&name)
            .execute(&mut *tx)
            .await?;
    }
    Ok(tx)
}

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

pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let options: PgConnectOptions = database_url
        .parse::<PgConnectOptions>()?
        .application_name("vibe-kanban-remote");

    PgPoolOptions::new()
        .max_connections(10)
        .connect_with(options)
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
