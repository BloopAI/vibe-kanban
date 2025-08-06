// Test file to verify compilation - copy of main_new.rs with corrections
use std::{str::FromStr, sync::Arc};

use axum::{
    body::Body,
    http::{header, HeaderValue, StatusCode},
    middleware::from_fn_with_state,
    response::{IntoResponse, Json as ResponseJson, Response},
    routing::{get, post},
    Json, Router,
};
use sentry_tower::NewSentryLayer;
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use strip_ansi_escapes::strip;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{filter::LevelFilter, prelude::*};
use automagik_forge::{sentry_layer, Assets, ScriptAssets, SoundAssets};

mod app_state;
mod auth;         // ADDED: Missing auth module declaration
mod execution_monitor;
mod executor;
mod executors;
mod mcp;
mod middleware;
mod models;
mod routes;
mod services;
mod utils;

use app_state::AppState;
use execution_monitor::execution_monitor;
use middleware::{
    load_execution_process_simple_middleware, load_project_middleware,
    load_task_attempt_middleware, load_task_middleware, load_task_template_middleware,
};
use models::{ApiResponse, Config};
use routes::{
    auth, config, filesystem, health, projects, stream, task_attempts, task_templates, tasks,
};
use services::PrMonitorService;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

mod openapi;
use openapi::ApiDoc;

// ... rest of the file content would be the same ...