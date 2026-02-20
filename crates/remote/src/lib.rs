mod analytics;
mod app;
mod auth;
pub mod azure_blob;
mod shared_key_auth;
mod billing;
pub mod config;
pub mod db;
pub mod mutation_definition;
pub mod github_app;
pub mod mail;
mod middleware;
pub mod r2;
pub mod routes;
pub mod shape_definition;
pub mod shape_route;
pub mod shape_routes;
pub mod shapes;
mod state;
pub mod attachments;

use std::env;

pub use app::Server;
pub use billing::{BillingCheckError, BillingService};
pub use state::AppState;
use tracing_error::ErrorLayer;
use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::{Layer as _, SubscriberExt},
    util::SubscriberInitExt,
};
pub use utils::sentry::{init_once as sentry_init_once, SentrySource};

pub fn init_tracing() {
    if tracing::dispatcher::has_been_set() {
        return;
    }

    let env_filter = env::var("RUST_LOG").unwrap_or_else(|_| "info,sqlx=warn".to_string());
    let fmt_layer = fmt::layer()
        .json()
        .with_target(false)
        .with_span_events(FmtSpan::CLOSE)
        .boxed();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(env_filter))
        .with(ErrorLayer::default())
        .with(fmt_layer)
        .with(utils::sentry::sentry_layer())
        .init();
}

pub fn configure_user_scope(user_id: uuid::Uuid, username: Option<&str>, email: Option<&str>) {
    utils::sentry::configure_user_scope(&user_id.to_string(), username, email);
}
