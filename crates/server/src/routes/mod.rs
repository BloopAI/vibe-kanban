use axum::{
    Router,
    routing::{IntoMakeService, get},
    http::{Method, HeaderValue},
};
use tower_http::cors::{CorsLayer, Any};

use crate::DeploymentImpl;

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
    // Create routers with different middleware layers
    let base_routes = Router::new()
        .route("/health", get(health::health_check))
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
        .merge(oauth::router())
        .merge(organizations::router())
        .merge(github::router(&deployment))
        .merge(filesystem::router())
        .merge(repo::router())
        .merge(events::router(&deployment))
        .merge(approvals::router())
        .merge(scratch::router(&deployment))
        .merge(sessions::router(&deployment))
        .nest("/images", images::routes())
        .with_state(deployment);

    let cors = CorsLayer::new()
        .allow_origin([
            "https://scho1ar.com".parse::<HeaderValue>().unwrap(),
            "https://www.scho1ar.com".parse::<HeaderValue>().unwrap(),
            "https://scho1ar.fly.dev".parse::<HeaderValue>().unwrap(),
            "http://localhost:3000".parse::<HeaderValue>().unwrap(),
            "http://localhost:3003".parse::<HeaderValue>().unwrap(),
             // Allow backend domain itself if needed
            "https://vibe-kanban.fly.dev".parse::<HeaderValue>().unwrap(),
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
        .nest("/api", base_routes)
        .route("/", get(|| async { "Backend API Running" })) // Simple root response
        .layer(cors)
        .into_make_service()
}
