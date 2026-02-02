//! Preview Proxy Server Module
//!
//! Provides a separate HTTP server for serving preview iframe content.
//! This isolates preview content from the main application for security.
//!
//! The proxy listens on a separate port (configurable via PREVIEW_PROXY_PORT env var)
//! and serves workspace preview content through controlled routes.

use std::sync::OnceLock;

use axum::Router;

/// Global storage for the preview proxy port once assigned.
/// Set once during server startup, read by the config API.
static PROXY_PORT: OnceLock<u16> = OnceLock::new();

/// Get the preview proxy port if set.
pub fn get_proxy_port() -> Option<u16> {
    PROXY_PORT.get().copied()
}

/// Set the preview proxy port. Can only be called once.
/// Returns the port if successfully set, or None if already set.
pub fn set_proxy_port(port: u16) -> Option<u16> {
    PROXY_PORT.set(port).ok().map(|()| port)
}

/// Create the preview proxy router.
/// Currently returns an empty router - actual routes will be added in subsequent tasks.
pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
}
