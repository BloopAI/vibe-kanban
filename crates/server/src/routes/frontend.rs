use std::borrow::Cow;

use axum::{
    body::{Body, Bytes},
    http::HeaderValue,
    response::{IntoResponse, Response},
};
use reqwest::{StatusCode, header};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../../packages/local-web/dist"]
struct Assets;

pub(super) async fn serve_frontend(uri: axum::extract::Path<String>) -> impl IntoResponse {
    let path = uri.trim_start_matches('/');
    serve_file(path).await
}

pub(super) async fn serve_frontend_root() -> impl IntoResponse {
    serve_file("index.html").await
}

async fn serve_file(path: &str) -> impl IntoResponse + use<> {
    if trace_frontend_assets() {
        tracing::info!(path, "Frontend asset request");
    }

    if path.ends_with(".map") && !serve_frontend_source_maps() {
        if trace_frontend_assets() {
            tracing::info!(path, "Frontend source map request blocked");
        }

        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("404 Not Found"))
            .unwrap();
    }

    let file = Assets::get(path);

    match file {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            let body = embedded_asset_body(content.data);

            Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref()).unwrap(),
                )
                .body(body)
                .unwrap()
        }
        None => {
            // For SPA routing, serve index.html for unknown routes
            if let Some(index) = Assets::get("index.html") {
                let body = embedded_asset_body(index.data);

                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, HeaderValue::from_static("text/html"))
                    .body(body)
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

fn embedded_asset_body(data: Cow<'static, [u8]>) -> Body {
    match data {
        Cow::Borrowed(bytes) => Body::from(Bytes::from_static(bytes)),
        Cow::Owned(bytes) => Body::from(Bytes::from(bytes)),
    }
}

fn serve_frontend_source_maps() -> bool {
    std::env::var("VK_SERVE_FRONTEND_SOURCE_MAPS")
        .ok()
        .is_some_and(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
}

fn trace_frontend_assets() -> bool {
    std::env::var("VK_TRACE_FRONTEND_ASSETS")
        .ok()
        .is_some_and(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
}
