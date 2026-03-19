use std::sync::Arc;

mod handler;
mod oauth;
mod tools;

use axum::{Router, middleware};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};

use crate::AppState;

pub fn router(state: AppState) -> Router<AppState> {
    let pool = state.pool().clone();

    let session_manager = Arc::new(LocalSessionManager::default());
    let config = StreamableHttpServerConfig::default();

    let mcp_service = StreamableHttpService::new(
        move || Ok(handler::RemoteMcpServer::new(pool.clone())),
        session_manager,
        config,
    );

    let mcp_routes = Router::<AppState>::new()
        .nest_service("/v1/mcp", mcp_service)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            oauth::mcp_auth_middleware,
        ));

    let oauth_routes = oauth::router();

    Router::new().merge(mcp_routes).merge(oauth_routes)
}
