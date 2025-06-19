use axum::{
    body::Body,
    extract::Extension,
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Json as ResponseJson, Response},
    routing::{get, post},
    Json, Router,
};
use directories::ProjectDirs;
use rust_embed::RustEmbed;
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use std::str::FromStr;
use std::{collections::HashMap, env, sync::Arc};
use tokio::sync::{Mutex, RwLock};
use tower_http::cors::CorsLayer;

mod execution_monitor;
mod executor;
mod executors;
mod models;
mod routes;
mod utils;

use execution_monitor::{execution_monitor, AppState};
use models::{ApiResponse, Config};
use routes::{config, filesystem, health, projects, tasks};

#[derive(RustEmbed)]
#[folder = "../frontend/dist"]
struct Assets;

async fn echo_handler(
    Json(payload): Json<serde_json::Value>,
) -> ResponseJson<ApiResponse<serde_json::Value>> {
    ResponseJson(ApiResponse {
        success: true,
        data: Some(payload),
        message: Some("Echo successful".to_string()),
    })
}

async fn static_handler(uri: axum::extract::Path<String>) -> impl IntoResponse {
    let path = uri.trim_start_matches('/');
    serve_file(path).await
}

async fn index_handler() -> impl IntoResponse {
    serve_file("index.html").await
}

async fn serve_file(path: &str) -> impl IntoResponse {
    let file = Assets::get(path);

    match file {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();

            Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref()).unwrap(),
                )
                .body(Body::from(content.data.into_owned()))
                .unwrap()
        }
        None => {
            // For SPA routing, serve index.html for unknown routes
            if let Some(index) = Assets::get("index.html") {
                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, HeaderValue::from_static("text/html"))
                    .body(Body::from(index.data.into_owned()))
                    .unwrap()
            } else {
                Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Body::from("404 Not Found"))
                    .unwrap()
            }
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().init();

    // Create asset directory if it doesn't exist
    if !utils::asset_dir().exists() {
        std::fs::create_dir_all(utils::asset_dir())?;
    }

    // Database connection
    let database_url = format!(
        "sqlite://{}",
        utils::asset_dir().join("db.sqlite").to_string_lossy()
    );

    let options = SqliteConnectOptions::from_str(&database_url)?.create_if_missing(true);
    let pool = SqlitePool::connect_with(options).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    // Load configuration
    let config_path = utils::config_path();
    let config = Config::load(&config_path)?;
    let config_arc = Arc::new(RwLock::new(config));

    // Create app state
    let app_state = AppState {
        running_executions: Arc::new(Mutex::new(HashMap::new())),
        db_pool: pool.clone(),
    };

    // Start background task to check for init status and spawn processes
    let state_clone = app_state.clone();
    tokio::spawn(async move {
        execution_monitor(state_clone).await;
    });

    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/api/health", get(health::health_check))
        .route("/api/echo", post(echo_handler));

    // All routes (no auth required)
    let app_routes = Router::new()
        .nest(
            "/api",
            Router::new()
                .merge(projects::projects_router())
                .merge(tasks::tasks_router())
                .merge(filesystem::filesystem_router())
                .merge(config::config_router()),
        )
        .layer(Extension(pool.clone()))
        .layer(Extension(config_arc));

    let app = Router::new()
        .merge(public_routes)
        .merge(app_routes)
        // Static file serving routes
        .route("/", get(index_handler))
        .route("/*path", get(static_handler))
        .layer(Extension(pool))
        .layer(Extension(app_state))
        .layer(CorsLayer::permissive());

    let port: u16 = if cfg!(debug_assertions) { 3001 } else { 0 }; // 0 = random port

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    let actual_port = listener.local_addr()?.port(); // get → 53427 (example)

    tracing::info!("Server running on http://0.0.0.0:{actual_port}");

    if !cfg!(debug_assertions) {
        tracing::info!("Opening browser...");
        open::that(format!("http://127.0.0.1:{actual_port}"))?;
    }

    axum::serve(listener, app).await?;

    Ok(())
}
