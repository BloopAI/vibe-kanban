// Successfully edited temp file - now copy complete corrected content
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
mod auth;
mod execution_monitor;
mod executor;
mod executors;
mod mcp;
mod middleware;
mod models;
mod routes;
mod services;
mod utils;