mod analytics;
mod app;
pub mod attachments;
pub mod audit;
mod auth;
pub mod azure_blob;
mod billing;
pub mod config;
pub mod db;
pub mod github_app;
pub mod mail;
mod middleware;
pub mod mutation_definition;
pub mod notifications;
pub mod r2;
pub mod routes;
pub mod shape_definition;
pub mod shape_route;
pub mod shape_routes;
pub mod shapes;
mod shared_key_auth;
mod state;

use std::env;

pub use app::Server;
pub use billing::{BillingCheckError, BillingService};
use opentelemetry::trace::TracerProvider as _;
pub use state::AppState;
use tracing_error::ErrorLayer;
use tracing_subscriber::{
    Layer,
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
};
pub use utils::sentry::{SentrySource, init_once as sentry_init_once};

fn init_otel_layer<S>() -> Option<Box<dyn Layer<S> + Send + Sync>>
where
    S: tracing::Subscriber
        + for<'span> tracing_subscriber::registry::LookupSpan<'span>
        + Send
        + Sync,
{
    let connection_string = env::var("APPLICATIONINSIGHTS_CONNECTION_STRING").ok()?;
    if connection_string.is_empty() {
        return None;
    }

    // Create the background client using std::thread::spawn.
    // https://github.com/frigus02/opentelemetry-application-insights/blob/6d3ac4505c0c47e448bb8de4ac67d904f8eacb76/src/lib.rs#L168
    let http_client = std::thread::spawn(otel_reqwest::blocking::Client::new)
        .join()
        .ok()?;

    let exporter = opentelemetry_application_insights::Exporter::new_from_connection_string(
        &connection_string,
        http_client,
    )
    .ok()?;

    let service_name =
        env::var("OTEL_SERVICE_NAME").unwrap_or_else(|_| "vibe-kanban-remote".to_string());

    let provider = opentelemetry_sdk::trace::SdkTracerProvider::builder()
        .with_resource(
            opentelemetry_sdk::Resource::builder()
                .with_service_name(service_name)
                .build(),
        )
        .with_batch_exporter(exporter)
        .build();

    // Register globally so the provider outlives this function.
    // Without this, Drop shuts down the batch exporter and no spans export.
    opentelemetry::global::set_tracer_provider(provider.clone());

    let tracer = provider.tracer("vibe-kanban-remote");
    let layer = tracing_opentelemetry::OpenTelemetryLayer::new(tracer);
    Some(layer.boxed())
}

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

    let otel_layer = init_otel_layer();
    let otel_enabled = otel_layer.is_some();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(env_filter))
        .with(ErrorLayer::default())
        .with(fmt_layer)
        .with(otel_layer)
        .with(utils::sentry::sentry_layer())
        .init();

    tracing::info!(
        otel_enabled,
        "Tracing initialized ({})",
        if otel_enabled {
            "stdout + Application Insights"
        } else {
            "stdout only"
        }
    );
}

pub fn configure_user_scope(user_id: uuid::Uuid, username: Option<&str>, email: Option<&str>) {
    utils::sentry::configure_user_scope(&user_id.to_string(), username, email);
}
