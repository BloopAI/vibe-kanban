use axum::{
    Json, Router,
    body::Bytes,
    extract::{Extension, Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_admin_access};
use crate::{
    AppState,
    auth::RequestContext,
    billing::{BillingError, BillingStatus, BillingStatusResponse, CreatePortalRequest},
    db::organization_members,
};

pub fn public_router() -> Router<AppState> {
    Router::new().route("/billing/webhook", post(handle_webhook))
}

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/organizations/{org_id}/billing", get(get_billing_status))
        .route(
            "/organizations/{org_id}/billing/portal",
            post(create_portal_session),
        )
        .route(
            "/organizations/{org_id}/billing/checkout",
            post(create_checkout_session),
        )
}

pub async fn get_billing_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
) -> Result<impl IntoResponse, ErrorResponse> {
    organization_members::assert_membership(&state.pool, org_id, ctx.user.id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::FORBIDDEN, "Access denied"))?;

    let can_manage_billing = organization_has_billing_history(&state.pool, org_id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    if !can_manage_billing {
        return Ok(Json(json!({
            "status": BillingStatus::Free,
            "billing_enabled": state.billing().is_configured(),
            "seat_info": null,
            "can_manage_billing": false,
        })));
    }

    match state.billing().provider() {
        Some(billing) => {
            let status = billing
                .get_billing_status(org_id)
                .await
                .map_err(billing_error)?;
            Ok(Json(augment_billing_status(status, can_manage_billing)))
        }
        None => Ok(Json(json!({
            "status": BillingStatus::Free,
            "billing_enabled": false,
            "seat_info": null,
            "can_manage_billing": false,
        }))),
    }
}

pub async fn create_portal_session(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<CreatePortalRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    ensure_admin_access(&state.pool, org_id, ctx.user.id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required"))?;

    if !organization_has_billing_history(&state.pool, org_id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    {
        return Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "No Stripe subscription history found for this organization",
        ));
    }

    let billing = state.billing().provider().ok_or_else(|| {
        ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "Billing not configured")
    })?;

    let session = billing
        .create_portal_session(org_id, &payload.return_url)
        .await
        .map_err(billing_error)?;

    Ok(Json(session))
}

pub async fn create_checkout_session() -> Result<StatusCode, ErrorResponse> {
    Err(ErrorResponse::new(
        StatusCode::GONE,
        "New subscriptions are disabled because Vibe Kanban Cloud is shutting down",
    ))
}

pub async fn handle_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, ErrorResponse> {
    let billing = state.billing().provider().ok_or_else(|| {
        ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "Billing not configured")
    })?;

    let signature = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    billing
        .handle_webhook(&body, signature)
        .await
        .map_err(billing_error)?;

    Ok(StatusCode::OK)
}

fn billing_error(error: BillingError) -> ErrorResponse {
    match error {
        BillingError::NotConfigured => {
            ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "Billing not configured")
        }
        BillingError::SubscriptionRequired(msg) => {
            ErrorResponse::new(StatusCode::PAYMENT_REQUIRED, msg)
        }
        BillingError::SubscriptionInactive => {
            ErrorResponse::new(StatusCode::PAYMENT_REQUIRED, "Subscription is inactive")
        }
        BillingError::Stripe(msg) => {
            tracing::error!(?msg, "Stripe error");
            ErrorResponse::new(StatusCode::BAD_GATEWAY, "Payment provider error")
        }
        BillingError::Database(e) => {
            tracing::error!(?e, "Database error in billing");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        }
        BillingError::OrganizationNotFound => {
            ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
        }
    }
}

fn augment_billing_status(status: BillingStatusResponse, can_manage_billing: bool) -> Value {
    let mut value = serde_json::to_value(status).unwrap_or_else(|_| {
        json!({
            "status": BillingStatus::Free,
            "billing_enabled": false,
            "seat_info": null,
        })
    });

    if let Some(object) = value.as_object_mut() {
        object.insert(
            "can_manage_billing".to_string(),
            Value::Bool(can_manage_billing),
        );
    }

    value
}

async fn organization_has_billing_history(
    pool: &PgPool,
    org_id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM organization_billing
            WHERE organization_id = $1
              AND (
                  stripe_customer_id IS NOT NULL
                  OR stripe_subscription_id IS NOT NULL
              )
        )
        "#,
    )
    .bind(org_id)
    .fetch_one(pool)
    .await
}
