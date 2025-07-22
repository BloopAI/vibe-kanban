use rust_embed::RustEmbed;
use sentry_tracing::{EventFilter, SentryLayer};
use tracing::Level;

pub mod app_state;
pub mod command_runner;
pub mod execution_monitor;
pub mod executor;
pub mod executors;
pub mod mcp;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod services;
pub mod utils;

#[derive(RustEmbed)]
#[folder = "../frontend/dist"]
pub struct Assets;

#[derive(RustEmbed)]
#[folder = "sounds"]
pub struct SoundAssets;

#[derive(RustEmbed)]
#[folder = "scripts"]
pub struct ScriptAssets;

pub fn sentry_layer<S>() -> SentryLayer<S>
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
