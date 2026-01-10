use std::sync::Arc;

use axum::{
    Router,
    middleware,
    routing::{IntoMakeService, get},
    http::{Method, HeaderValue, header::{AUTHORIZATION, CONTENT_TYPE, ACCEPT, ORIGIN, UPGRADE, CONNECTION}},
};
use tower_http::cors::CorsLayer;

use crate::DeploymentImpl;
use crate::middleware::{
    auth::{auth_middleware, AuthState},
    rate_limit::{create_rate_limit_layer, rate_limit_middleware, RateLimitConfig},
};
use deployment::Deployment;

pub mod api_keys;
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
pub mod registrations;
pub mod repo;
pub mod scratch;
pub mod sessions;
pub mod shared_tasks;
pub mod tags;
pub mod task_attempts;
pub mod tasks;
pub mod teams;
pub mod tenant_workspaces;

pub fn router(deployment: DeploymentImpl) -> IntoMakeService<Router> {
    // Check if auth is enabled (disabled by default for backwards compatibility)
    let auth_enabled = std::env::var("ENABLE_API_AUTH")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    // Create auth state with database pool for API key support
    let auth_state = Arc::new(
        AuthState::new().with_db_pool(deployment.db().pool.clone())
    );

    // Create rate limiter (default 1000 requests per minute per IP, configurable)
    let requests_per_minute = std::env::var("API_RATE_LIMIT_REQUESTS")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(1000);

    let rate_limiter = create_rate_limit_layer(RateLimitConfig {
        requests_per_window: requests_per_minute,
        window_seconds: 60,
    });

    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())
        .merge(oauth::router());

    // Protected routes (auth required when enabled)
    let protected_routes = Router::new()
        .merge(api_keys::router(&deployment))
        .merge(containers::router(&deployment))
        .merge(projects::router(&deployment))
        .merge(tasks::router(&deployment))
        .merge(shared_tasks::router())
        .merge(task_attempts::router(&deployment))
        .merge(execution_processes::router(&deployment))
        .merge(tags::router(&deployment))
        .merge(teams::router(&deployment))
        .merge(tenant_workspaces::router())
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
        .nest("/images", images::routes())
        .nest("/registrations", registrations::router(&deployment));

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
            // Production custom domains
            "https://app.scho1ar.com".parse::<HeaderValue>().unwrap(),
            "https://www.app.scho1ar.com".parse::<HeaderValue>().unwrap(),
            "https://api.scho1ar.com".parse::<HeaderValue>().unwrap(),
            "https://scho1ar.com".parse::<HeaderValue>().unwrap(),
            "https://www.scho1ar.com".parse::<HeaderValue>().unwrap(),
            // Local development
            "http://localhost:3000".parse::<HeaderValue>().unwrap(),
            "http://localhost:3003".parse::<HeaderValue>().unwrap(),
            // Railway deployment domains
            "https://vibe-kanban-frontend-production.up.railway.app".parse::<HeaderValue>().unwrap(),
            "https://vibe-kanban-api-production.up.railway.app".parse::<HeaderValue>().unwrap(),
            // Legacy Fly.io domains
            "https://scho1ar.fly.dev".parse::<HeaderValue>().unwrap(),
            "https://vibe-kanban.fly.dev".parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods([
            Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::PATCH, Method::OPTIONS,
        ])
        .allow_credentials(true)
        .allow_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            ACCEPT,
            ORIGIN,
            UPGRADE,
            CONNECTION,
        ]);
    
    // Allow dynamic origins from env var (comma separated)
    let cors = if let Ok(extra_origins) = std::env::var("CORS_ALLOWED_ORIGINS") {
        let mut origins = Vec::new();
        // Add hardcoded defaults
         origins.push("https://app.scho1ar.com".parse::<HeaderValue>().unwrap());
         origins.push("https://www.app.scho1ar.com".parse::<HeaderValue>().unwrap());
         origins.push("https://api.scho1ar.com".parse::<HeaderValue>().unwrap());
         origins.push("https://scho1ar.com".parse::<HeaderValue>().unwrap());
         origins.push("https://www.scho1ar.com".parse::<HeaderValue>().unwrap());
         origins.push("http://localhost:3000".parse::<HeaderValue>().unwrap());
         origins.push("http://localhost:3003".parse::<HeaderValue>().unwrap());
         origins.push("https://vibe-kanban-frontend-production.up.railway.app".parse::<HeaderValue>().unwrap());
         origins.push("https://vibe-kanban-api-production.up.railway.app".parse::<HeaderValue>().unwrap());
         origins.push("https://scho1ar.fly.dev".parse::<HeaderValue>().unwrap());
         origins.push("https://vibe-kanban.fly.dev".parse::<HeaderValue>().unwrap());

        for origin in extra_origins.split(',') {
            if let Ok(val) = origin.trim().parse::<HeaderValue>() {
                origins.push(val);
            }
        }
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods([
                Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::PATCH, Method::OPTIONS,
            ])
            .allow_credentials(true)
            .allow_headers([
                AUTHORIZATION,
                CONTENT_TYPE,
                ACCEPT,
                ORIGIN,
                UPGRADE,
                CONNECTION,
            ])
    } else {
        cors
    };


    Router::new()
        // .route("/", get(frontend::serve_frontend_root))
        // .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", api_routes)
        .route("/", get(|| async { "Backend API Running" })) // Simple root response
        .layer(cors)
        .into_make_service()
}
