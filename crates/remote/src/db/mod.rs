pub mod auth;
pub mod github_app;
pub mod identity_errors;
pub mod invitations;
pub mod notifications;
pub mod oauth;
pub mod oauth_accounts;
pub mod organization_members;
pub mod organizations;
pub mod project_notification_preferences;
pub mod project_statuses;
pub mod project_tasks;
pub mod projects;
pub mod remote_projects;
pub mod remote_workspaces;
pub mod reviews;
pub mod tags;
pub mod task_assignees;
pub mod task_comment_reactions;
pub mod task_comments;
pub mod task_dependencies;
pub mod task_followers;
pub mod task_tags;
pub mod tasks;
pub mod types;
pub mod users;

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
