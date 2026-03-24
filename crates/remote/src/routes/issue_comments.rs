use api_types::{
    CreateIssueCommentRequest, DeleteResponse, IssueComment, ListIssueCommentsQuery,
    ListIssueCommentsResponse, MemberRole, MutationResponse, NotificationPayload, NotificationType,
    UpdateIssueCommentRequest,
};
use axum::{
    Json,
    extract::{Extension, Path, Query, State},
    http::StatusCode,
};
use secrecy::ExposeSecret;
use tracing::instrument;
use uuid::Uuid;

use super::{
    error::{ErrorResponse, db_error},
    organization_members::ensure_issue_access,
};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        issue_comments::IssueCommentRepository, issues::IssueRepository,
        organization_members::check_user_role,
    },
    mutation_definition::MutationBuilder,
    notifications::notify_issue_subscribers,
};

/// Mutation definition for IssueComment - provides both router and TypeScript metadata.
pub fn mutation()
-> MutationBuilder<IssueComment, CreateIssueCommentRequest, UpdateIssueCommentRequest> {
    MutationBuilder::new("issue_comments")
        .list(list_issue_comments)
        .get(get_issue_comment)
        .create(create_issue_comment)
        .update(update_issue_comment)
        .delete(delete_issue_comment)
}

pub fn router() -> axum::Router<AppState> {
    mutation().router()
}

#[instrument(
    name = "issue_comments.list_issue_comments",
    skip(state, ctx),
    fields(issue_id = %query.issue_id, user_id = %ctx.user.id)
)]
async fn list_issue_comments(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<ListIssueCommentsQuery>,
) -> Result<Json<ListIssueCommentsResponse>, ErrorResponse> {
    ensure_issue_access(state.pool(), ctx.user.id, query.issue_id).await?;

    let issue_comments = IssueCommentRepository::list_by_issue(state.pool(), query.issue_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, issue_id = %query.issue_id, "failed to list issue comments");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to list issue comments",
            )
        })?;

    Ok(Json(ListIssueCommentsResponse { issue_comments }))
}

#[instrument(
    name = "issue_comments.get_issue_comment",
    skip(state, ctx),
    fields(issue_comment_id = %issue_comment_id, user_id = %ctx.user.id)
)]
async fn get_issue_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_comment_id): Path<Uuid>,
) -> Result<Json<IssueComment>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), issue_comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_comment_id, "failed to load issue comment");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue comment",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue comment not found"))?;

    ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    Ok(Json(comment))
}

#[instrument(
    name = "issue_comments.create_issue_comment",
    skip(state, ctx, payload),
    fields(issue_id = %payload.issue_id, user_id = %ctx.user.id)
)]
async fn create_issue_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateIssueCommentRequest>,
) -> Result<Json<MutationResponse<IssueComment>>, ErrorResponse> {
    let organization_id = ensure_issue_access(state.pool(), ctx.user.id, payload.issue_id).await?;

    let is_reply = payload.parent_id.is_some();

    let response = IssueCommentRepository::create(
        state.pool(),
        payload.id,
        payload.issue_id,
        ctx.user.id,
        payload.parent_id,
        payload.message,
    )
    .await
    .map_err(|error| {
        tracing::error!(?error, "failed to create issue comment");
        db_error(error, "failed to create issue comment")
    })?;

    if let Some(analytics) = state.analytics() {
        analytics.track(
            ctx.user.id,
            "issue_comment_created",
            serde_json::json!({
                "comment_id": response.data.id,
                "issue_id": response.data.issue_id,
                "organization_id": organization_id,
                "is_reply": is_reply,
            }),
        );
    }

    if let Ok(Some(issue)) = IssueRepository::find_by_id(state.pool(), response.data.issue_id).await
    {
        let comment_preview = response.data.message.chars().take(100).collect::<String>();
        notify_issue_subscribers(
            state.pool(),
            organization_id,
            ctx.user.id,
            &issue,
            NotificationType::IssueCommentAdded,
            NotificationPayload {
                comment_preview: Some(comment_preview),
                ..Default::default()
            },
            Some(response.data.id),
        )
        .await;
    }

    if let Some(enc_key) = state
        .config()
        .linear_encryption_key
        .as_ref()
        .map(|k| k.expose_secret().to_string())
    {
        let (pool, http, cid) = (
            state.pool().clone(),
            state.http_client.clone(),
            response.data.id,
        );
        let enc_key_clone = enc_key.clone();
        tokio::spawn(async move {
            crate::linear::outbound::push_comment_to_linear(&pool, &http, &enc_key_clone, cid)
                .await;
        });

        if !is_reply {
            let (pool, http, cid) = (
                state.pool().clone(),
                state.http_client.clone(),
                response.data.id,
            );
            tokio::spawn(async move {
                crate::slack::notify::notify_comment_added(&pool, &http, &enc_key, cid).await;
            });
        }
    }

    Ok(Json(response))
}

#[instrument(
    name = "issue_comments.update_issue_comment",
    skip(state, ctx, payload),
    fields(issue_comment_id = %issue_comment_id, user_id = %ctx.user.id)
)]
async fn update_issue_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_comment_id): Path<Uuid>,
    Json(payload): Json<UpdateIssueCommentRequest>,
) -> Result<Json<MutationResponse<IssueComment>>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), issue_comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_comment_id, "failed to load issue comment");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue comment",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue comment not found"))?;

    let organization_id = ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    let is_author = comment
        .author_id
        .map(|id| id == ctx.user.id)
        .unwrap_or(false);
    let is_admin = check_user_role(state.pool(), organization_id, ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to check user role");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?
        .map(|role| role == MemberRole::Admin)
        .unwrap_or(false);

    if !is_author && !is_admin {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "you do not have permission to edit this comment",
        ));
    }

    let response = IssueCommentRepository::update(state.pool(), issue_comment_id, payload.message)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to update issue comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    if let Some(enc_key) = state
        .config()
        .linear_encryption_key
        .as_ref()
        .map(|k| k.expose_secret().to_string())
    {
        let (pool, http, cid) = (
            state.pool().clone(),
            state.http_client.clone(),
            issue_comment_id,
        );
        tokio::spawn(async move {
            crate::linear::outbound::push_comment_to_linear(&pool, &http, &enc_key, cid).await;
        });
    }

    Ok(Json(response))
}

#[instrument(
    name = "issue_comments.delete_issue_comment",
    skip(state, ctx),
    fields(issue_comment_id = %issue_comment_id, user_id = %ctx.user.id)
)]
async fn delete_issue_comment(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(issue_comment_id): Path<Uuid>,
) -> Result<Json<DeleteResponse>, ErrorResponse> {
    let comment = IssueCommentRepository::find_by_id(state.pool(), issue_comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %issue_comment_id, "failed to load issue comment");
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to load issue comment",
            )
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "issue comment not found"))?;

    let organization_id = ensure_issue_access(state.pool(), ctx.user.id, comment.issue_id).await?;

    let is_author = comment
        .author_id
        .map(|id| id == ctx.user.id)
        .unwrap_or(false);
    let is_admin = check_user_role(state.pool(), organization_id, ctx.user.id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to check user role");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?
        .map(|role| role == MemberRole::Admin)
        .unwrap_or(false);

    if !is_author && !is_admin {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "you do not have permission to delete this comment",
        ));
    }

    // Capture linear comment link data BEFORE deleting the VK comment, because the
    // ON DELETE CASCADE on linear_comment_links.vk_comment_id will remove the link row
    // automatically when the VK comment is deleted, making it unreachable afterwards.
    let linear_comment_data = if let Some(enc_key) = state
        .config()
        .linear_encryption_key
        .as_ref()
        .map(|k| k.expose_secret().to_string())
    {
        let row = sqlx::query!(
            r#"SELECT lcl.linear_comment_id, lpc.encrypted_api_key
               FROM linear_comment_links lcl
               JOIN linear_project_connections lpc ON lpc.id = lcl.connection_id
               WHERE lcl.vk_comment_id = $1"#,
            issue_comment_id
        )
        .fetch_optional(state.pool())
        .await
        .ok()
        .flatten();
        row.map(|r| (enc_key, r.encrypted_api_key, r.linear_comment_id))
    } else {
        None
    };

    let response = IssueCommentRepository::delete(state.pool(), issue_comment_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to delete issue comment");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?;

    if let Some((enc_key, encrypted_api_key, linear_comment_id)) = linear_comment_data {
        let http = state.http_client.clone();
        tokio::spawn(async move {
            crate::linear::outbound::delete_linear_issue_comment(
                &http,
                &enc_key,
                &encrypted_api_key,
                &linear_comment_id,
            )
            .await;
        });
    }

    Ok(Json(response))
}
