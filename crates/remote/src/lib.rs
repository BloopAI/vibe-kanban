pub mod activity;
pub mod api;
mod app;
mod auth;
pub mod config;
pub mod db;
pub mod routes;
mod state;
pub mod ws;

use std::env;

pub use app::Server;
pub use state::AppState;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
pub use ws::message::{ClientMessage, ServerMessage};

pub fn init_tracing() {
    if tracing::dispatcher::has_been_set() {
        return;
    }

    let env_filter = env::var("RUST_LOG").unwrap_or_else(|_| "info,sqlx=warn".to_string());
    let fmt_layer = tracing_subscriber::fmt::layer().with_target(false);

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(env_filter))
        .with(fmt_layer)
        .init();
}
