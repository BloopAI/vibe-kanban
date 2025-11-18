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
pub mod project_members;
pub mod project_notification_preferences;
pub mod project_statuses;
pub mod project_task_notification_preferences;
pub mod project_tasks;
pub mod projects;
pub mod remote_projects;
pub mod sprints;
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
