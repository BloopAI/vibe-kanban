use std::sync::Arc;

use axum::{
    Router,
    middleware,
    routing::{IntoMakeService, get},
    http::{Method, HeaderValue},
};
use tower_http::cors::{CorsLayer, Any};

use crate::DeploymentImpl;
use crate::middleware::{
    auth::{auth_middleware, AuthState},
    rate_limit::{create_rate_limit_layer, rate_limit_middleware, RateLimitConfig},
};

pub mod approvals;
pub mod config;
pub mod containers;
pub mod documents;
pub mod filesystem;
pub mod github;
pub mod events;
pub mod execution_processes;
// pub mod frontend;
pub mod health;
pub mod images;
pub mod inbox;
pub mod oauth;
pub mod organizations;
pub mod projects;
pub mod repo;
pub mod scratch;
pub mod sessions;
pub mod shared_tasks;
pub mod tags;
pub mod task_attempts;
pub mod tasks;
pub mod teams;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    // Check if auth is enabled (disabled by default for backwards compatibility)
    let auth_enabled = std::env::var("ENABLE_API_AUTH")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    // Create auth state
    let auth_state = Arc::new(AuthState::new());

    // Create rate limiter (100 requests per minute per IP)
    let rate_limiter = create_rate_limit_layer(RateLimitConfig::default());

    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(oauth::router());

    // Protected routes (auth required when enabled)
    let protected_routes = Router::new()
        .merge(config::router())
        .merge(containers::router(&deployment))
        .merge(projects::router(&deployment))
        .merge(tasks::router(&deployment))
        .merge(shared_tasks::router())
        .merge(task_attempts::router(&deployment))
        .merge(execution_processes::router(&deployment))
        .merge(tags::router(&deployment))
        .merge(teams::router(&deployment))
        .merge(documents::router(&deployment))
        .merge(inbox::router(&deployment))
        .merge(organizations::router())
        .merge(github::router(&deployment))
        .merge(filesystem::router())
        .merge(repo::router())
        .merge(events::router(&deployment))
        .merge(approvals::router())
        .merge(scratch::router(&deployment))
        .merge(sessions::router(&deployment))
        .nest("/images", images::routes());

    // Apply auth middleware only if enabled
    let protected_routes = if auth_enabled {
        tracing::info!("API authentication is ENABLED");
        protected_routes
            .layer(middleware::from_fn_with_state(auth_state.clone(), auth_middleware))
    } else {
        tracing::warn!("API authentication is DISABLED - set ENABLE_API_AUTH=true to enable");
        protected_routes
    };

    // Combine routes with rate limiting
    let rate_limiter_clone = rate_limiter.clone();
    let api_routes = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .with_state(deployment)
        .layer(middleware::from_fn(move |req, next| {
            let limiter = rate_limiter_clone.clone();
            async move { rate_limit_middleware(req, next, limiter).await }
        }));

    let cors = CorsLayer::new()
        .allow_origin([
            "https://scho1ar.com".parse::<HeaderValue>().unwrap(),
            "https://www.scho1ar.com".parse::<HeaderValue>().unwrap(),
            "https://scho1ar.fly.dev".parse::<HeaderValue>().unwrap(),
            "http://localhost:3000".parse::<HeaderValue>().unwrap(),
            "http://localhost:3003".parse::<HeaderValue>().unwrap(),
             // Allow backend domain itself if needed
            "https://vibe-kanban.fly.dev".parse::<HeaderValue>().unwrap(),
            // Railway deployment domains
            "https://vibe-kanban-frontend-production.up.railway.app".parse::<HeaderValue>().unwrap(),
            "https://vibe-kanban-api-production.up.railway.app".parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
            Method::OPTIONS,
        ])
        .allow_headers(Any);

    Router::new()
        // .route("/", get(frontend::serve_frontend_root))
        // .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", api_routes)
        .route("/", get(|| async { "Backend API Running" })) // Simple root response
        .layer(cors)
        .into_make_service()
}
