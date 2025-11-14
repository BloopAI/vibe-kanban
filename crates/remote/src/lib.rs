pub mod activity;
mod app;
mod auth;
pub mod config;
pub mod db;
pub mod mail;
pub mod routes;
mod state;
pub mod ws;

use std::{env, sync::OnceLock};

pub use app::Server;
use sentry_tracing::{EventFilter, SentryLayer};
pub use state::AppState;
use tracing::Level;
use tracing_error::ErrorLayer;
use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::{Layer as _, SubscriberExt},
    util::SubscriberInitExt,
};
pub use ws::message::{ClientMessage, ServerMessage};

static INIT_GUARD: OnceLock<sentry::ClientInitGuard> = OnceLock::new();

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
        .with(sentry_layer())
        .init();
}

fn environment() -> &'static str {
    if cfg!(debug_assertions) {
        "dev"
    } else {
        "production"
    }
}

pub fn sentry_init_once() {
    INIT_GUARD.get_or_init(|| {
        sentry::init((
            "https://d6e4c45af2b081fadb10fb0ba726ccaf@o4509603705192449.ingest.de.sentry.io/4510305669283920",
            sentry::ClientOptions {
                release: sentry::release_name!(),
                environment: Some(environment().into()),
                ..Default::default()
            },
        ))
    });

    sentry::configure_scope(|scope| {
        scope.set_tag("source", "remote");
    });
}

pub fn configure_user_scope(user_id: uuid::Uuid, username: Option<&str>, email: Option<&str>) {
    let mut sentry_user = sentry::User {
        id: Some(user_id.to_string()),
        ..Default::default()
    };

    if let Some(username) = username {
        sentry_user.username = Some(username.to_string());
    }

    if let Some(email) = email {
        sentry_user.email = Some(email.to_string());
    }

    sentry::configure_scope(|scope| {
        scope.set_user(Some(sentry_user));
    });
}

fn sentry_layer<S>() -> SentryLayer<S>
where
    S: tracing::Subscriber,
    S: for<'a> tracing_subscriber::registry::LookupSpan<'a>,
{
    SentryLayer::default()
        .span_filter(|meta| {
            matches!(
                *meta.level(),
                Level::DEBUG | Level::INFO | Level::WARN | Level::ERROR
            )
        })
        .event_filter(|meta| match *meta.level() {
            Level::ERROR => EventFilter::Event,
            Level::DEBUG | Level::INFO | Level::WARN => EventFilter::Breadcrumb,
            Level::TRACE => EventFilter::Ignore,
        })
}
