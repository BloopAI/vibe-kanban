use axum::{Json, Router, middleware::from_fn, routing::post};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, middleware::require_trusted_ed25519_signature};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/signed-test", post(signed_test))
        .layer(from_fn(require_trusted_ed25519_signature))
}

async fn signed_test() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success("Signature accepted.".to_string()))
}
