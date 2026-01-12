use axum::{
    Extension, Json, Router,
    extract::{
        State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    middleware::from_fn_with_state,
    response::{IntoResponse, Json as ResponseJson},
    routing::get,
};
use db::models::project_group::{CreateProjectGroup, ProjectGroup, UpdateProjectGroup};
use deployment::Deployment;
use futures_util::{SinkExt, StreamExt, TryStreamExt};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, middleware::load_project_group_middleware};

pub async fn get_project_groups(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ProjectGroup>>>, ApiError> {
    let groups = ProjectGroup::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(groups)))
}

pub async fn stream_project_groups_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_project_groups_ws(socket, deployment).await {
            tracing::warn!("project_groups WS closed: {}", e);
        }
    })
}

async fn handle_project_groups_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
) -> anyhow::Result<()> {
    let mut stream = deployment
        .events()
        .stream_project_groups_raw()
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    // Split socket into sender and receiver
    let (mut sender, mut receiver) = socket.split();

    // Drain (and ignore) any client->server messages so pings/pongs work
    tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    // Forward server messages
    while let Some(item) = stream.next().await {
        match item {
            Ok(msg) => {
                if sender.send(msg).await.is_err() {
                    break; // client disconnected
                }
            }
            Err(e) => {
                tracing::error!("stream error: {}", e);
                break;
            }
        }
    }

    Ok(())
}

pub async fn get_project_group(
    Extension(group): Extension<ProjectGroup>,
) -> Result<ResponseJson<ApiResponse<ProjectGroup>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(group)))
}

pub async fn create_project_group(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateProjectGroup>,
) -> Result<ResponseJson<ApiResponse<ProjectGroup>>, ApiError> {
    let group = ProjectGroup::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "project_group_created",
            serde_json::json!({
                "group_id": group.id.to_string(),
                "group_name": group.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(group)))
}

pub async fn update_project_group(
    Extension(existing_group): Extension<ProjectGroup>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateProjectGroup>,
) -> Result<ResponseJson<ApiResponse<ProjectGroup>>, ApiError> {
    let updated_group =
        ProjectGroup::update(&deployment.db().pool, existing_group.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "project_group_updated",
            serde_json::json!({
                "group_id": updated_group.id.to_string(),
                "group_name": updated_group.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_group)))
}

pub async fn delete_project_group(
    Extension(group): Extension<ProjectGroup>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = ProjectGroup::delete(&deployment.db().pool, group.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "project_group_deleted",
                serde_json::json!({
                    "group_id": group.id.to_string(),
                }),
            )
            .await;

        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let group_id_router = Router::new()
        .route(
            "/",
            get(get_project_group)
                .put(update_project_group)
                .delete(delete_project_group),
        )
        .layer(from_fn_with_state(
            deployment.clone(),
            load_project_group_middleware,
        ));

    let groups_router = Router::new()
        .route("/", get(get_project_groups).post(create_project_group))
        .route("/stream/ws", get(stream_project_groups_ws))
        .nest("/{id}", group_id_router);

    Router::new().nest("/project-groups", groups_router)
}
