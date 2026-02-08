use axum::{
    body::Body,
    http::HeaderValue,
    response::{IntoResponse, Response},
};
use reqwest::{StatusCode, header};
use rust_embed::RustEmbed;
use serde_json;

#[derive(RustEmbed)]
#[folder = "../../frontend/dist"]
pub struct Assets;

pub async fn serve_frontend(uri: axum::extract::Path<String>) -> impl IntoResponse {
    let path = uri.trim_start_matches('/');
    serve_file(path).await
}

pub async fn serve_frontend_root() -> impl IntoResponse {
    serve_file("index.html").await
}

pub async fn serve_runtime_config() -> impl IntoResponse {
    let api_base = std::env::var("VK_SHARED_API_BASE")
        .or_else(|_| std::env::var("VITE_VK_SHARED_API_BASE"))
        .ok();

    let body = match api_base {
        Some(value) => {
            let json_value = serde_json::to_string(&value).unwrap_or_else(|_| "null".to_string());
            format!("window.__VK_CONFIG__ = {{ sharedApiBase: {} }};", json_value)
        }
        None => "window.__VK_CONFIG__ = window.__VK_CONFIG__ || {};".to_string(),
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/javascript"),
        )
        .body(Body::from(body))
        .unwrap()
}

async fn serve_file(path: &str) -> impl IntoResponse + use<> {
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
