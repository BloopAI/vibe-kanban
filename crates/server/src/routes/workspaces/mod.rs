pub mod codex_setup;
pub mod core;
pub mod create;
pub mod cursor_setup;
pub mod execution;
pub mod gh_cli_setup;
pub mod git;
pub mod images;
pub mod integration;
pub mod links;
pub mod pr;
pub mod repos;
pub mod streams;
pub mod workspace_summary;

use axum::{
    Router,
    middleware::from_fn_with_state,
    routing::{get, post},
};

use crate::{DeploymentImpl, middleware::load_workspace_middleware};

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let workspace_id_router = Router::new()
        .route(
            "/",
            get(core::get_workspace)
                .put(core::update_workspace)
                .delete(core::delete_workspace),
        )
        .route("/messages/first", get(core::get_first_user_message))
        .route("/seen", axum::routing::put(core::mark_seen))
        .nest("/git", git::router())
        .nest("/execution", execution::router())
        .nest("/integration", integration::router())
        .nest("/repos", repos::router())
        .nest("/pull-requests", pr::router())
        .layer(from_fn_with_state(
            deployment.clone(),
            load_workspace_middleware,
        ));

    let workspaces_router = Router::new()
        .route(
            "/",
            get(core::get_workspaces).post(create::create_workspace),
        )
        .route("/start", post(create::create_and_start_workspace))
        .route("/from-pr", post(pr::create_workspace_from_pr))
        .route("/streams/ws", get(streams::stream_workspaces_ws))
        .route(
            "/summaries",
            post(workspace_summary::get_workspace_summaries),
        )
        .nest("/{id}", workspace_id_router)
        .nest("/{id}/images", images::router(deployment))
        .nest("/{id}/links", links::router(deployment));

    Router::new().nest("/workspaces", workspaces_router)
}

#[cfg(test)]
mod tests {
    use axum::{
        Router,
        body::Body,
        http::{Request, StatusCode},
        response::IntoResponse,
        routing::{get, post},
    };

    async fn api_fallback() -> impl IntoResponse {
        StatusCode::NOT_FOUND
    }

    /// When an API route doesn't match, the request must NOT fall through to
    /// the frontend wildcard `/{*path}` (GET-only), which would return 405
    /// for POST/PUT/DELETE. Instead the `/api` nest's own 404 should be
    /// returned.
    #[tokio::test]
    async fn unmatched_api_post_returns_404_not_405() {
        async fn ok_get() -> impl IntoResponse {
            "frontend"
        }

        let api_routes: Router<()> = Router::new()
            .route("/workspaces/start", post(ok_get))
            .fallback(api_fallback);

        let app: Router<()> = Router::new()
            .nest("/api", api_routes)
            .fallback(get(ok_get));

        // POST to an unmatched /api path should return 404 (not 405 from
        // the GET-only frontend wildcard)
        let req = Request::builder()
            .method("POST")
            .uri("/api/nonexistent")
            .body(Body::empty())
            .unwrap();
        let resp = tower::ServiceExt::oneshot(app.clone(), req)
            .await
            .unwrap();
        assert_eq!(
            resp.status(),
            StatusCode::NOT_FOUND,
            "Unmatched API POST should return 404, not 405 from frontend wildcard"
        );
    }

    /// Verify that literal routes like `/start` are not shadowed by
    /// `/{id}` nests whose inner `/` only supports GET/PUT/DELETE.
    #[tokio::test]
    async fn post_start_not_shadowed_by_id_nest() {
        async fn ok_post() -> impl IntoResponse {
            "ok"
        }
        async fn ok_get() -> impl IntoResponse {
            "ok_get"
        }
        async fn ok_put() -> impl IntoResponse {
            "ok_put"
        }

        // Reproduce the exact router structure from the workspace module:
        // literal routes + nested /{id} + nested /{id}/images + nested /{id}/links
        let id_router = Router::<()>::new()
            .route("/", get(ok_get).put(ok_put).delete(ok_get))
            .route("/messages/first", get(ok_get))
            .route("/seen", axum::routing::put(ok_put));

        let images_router = Router::<()>::new()
            .route("/", get(ok_get))
            .route("/upload", post(ok_post));

        let links_router = Router::<()>::new()
            .route("/", post(ok_post).delete(ok_get));

        let inner: Router<()> = Router::new()
            .route("/", get(ok_get).post(ok_post))
            .route("/start", post(ok_post))
            .route("/from-pr", post(ok_post))
            .route("/streams/ws", get(ok_get))
            .route("/summaries", post(ok_post))
            .nest("/{workspace_id}", id_router)
            .nest("/{workspace_id}/images", images_router)
            .nest("/{workspace_id}/links", links_router);

        let app: Router<()> = Router::new().nest("/workspaces", inner);

        // POST /workspaces/start should match the literal route
        let req = Request::builder()
            .method("POST")
            .uri("/workspaces/start")
            .body(Body::empty())
            .unwrap();
        let resp = tower::ServiceExt::oneshot(app.clone(), req)
            .await
            .unwrap();
        assert_eq!(
            resp.status(),
            StatusCode::OK,
            "POST /workspaces/start should return 200, not 405"
        );

        // POST /workspaces/from-pr should also work
        let req = Request::builder()
            .method("POST")
            .uri("/workspaces/from-pr")
            .body(Body::empty())
            .unwrap();
        let resp = tower::ServiceExt::oneshot(app.clone(), req)
            .await
            .unwrap();
        assert_eq!(
            resp.status(),
            StatusCode::OK,
            "POST /workspaces/from-pr should return 200, not 405"
        );

        // GET /workspaces/<uuid> should still match the nest
        let req = Request::builder()
            .method("GET")
            .uri("/workspaces/some-uuid")
            .body(Body::empty())
            .unwrap();
        let resp = tower::ServiceExt::oneshot(app.clone(), req)
            .await
            .unwrap();
        assert_eq!(
            resp.status(),
            StatusCode::OK,
            "GET /workspaces/<uuid> should match the nested router"
        );
    }
}
