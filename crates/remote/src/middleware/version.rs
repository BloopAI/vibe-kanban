use axum::{
    body::Body,
    http::{Request, header::HeaderValue},
    middleware::Next,
    response::Response,
};

pub async fn add_version_headers(request: Request<Body>, next: Next) -> Response {
    let mut response = next.run(request).await;

    response.headers_mut().insert(
        "X-Server-Version",
        HeaderValue::from_static(env!("CARGO_PKG_VERSION")),
    );

    response
}
