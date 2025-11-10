use axum::{
    Json, Router,
    extract::{Extension, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use serde_json::json;
use tracing::instrument;

use crate::{
    AppState, activity::ActivityResponse, auth::RequestContext, db::activity::ActivityRepository,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/activity", get(get_activity_stream))
}

#[derive(Debug, Deserialize)]
pub struct ActivityQuery {
    /// Fetch events after this ID (exclusive)
    pub after: Option<i64>,
    /// Maximum number of events to return
    pub limit: Option<i64>,
}

#[instrument(
    name = "activity.get_activity_stream",
    skip(state, ctx, params),
    fields(org_id = %ctx.organization.id, user_id = %ctx.user.id )
)]
async fn get_activity_stream(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<ActivityQuery>,
) -> Response {
    let config = state.config();
    let limit = params
        .limit
        .unwrap_or(config.activity_default_limit)
        .clamp(1, config.activity_max_limit);
    let after = params.after;

    let repo = ActivityRepository::new(state.pool());
    match repo.fetch_since(&ctx.organization.id, after, limit).await {
        Ok(events) => (StatusCode::OK, Json(ActivityResponse { data: events })).into_response(),
        Err(error) => {
            tracing::error!(?error, "failed to load activity stream");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to load activity stream" })),
            )
                .into_response()
        }
    }
}
