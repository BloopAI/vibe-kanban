use axum::{
    Json, Router,
    body::Bytes,
    extract::{Extension, Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use uuid::Uuid;

use super::{error::ErrorResponse, organization_members::ensure_admin_access};
use crate::{
    AppState,
    auth::RequestContext,
    billing::{
        BillingError, BillingStatus, BillingStatusResponse, CreateCheckoutRequest,
        CreatePortalRequest,
    },
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

    match state.billing().provider() {
        Some(billing) => {
            let status = billing
                .get_billing_status(org_id)
                .await
                .map_err(billing_error)?;
            Ok(Json(status))
        }
        None => Ok(Json(BillingStatusResponse {
            status: BillingStatus::Free,
            billing_enabled: false,
            seat_info: None,
        })),
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

    let billing = state.billing().provider().ok_or_else(|| {
        ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "Billing not configured")
    })?;

    let session = billing
        .create_portal_session(org_id, &payload.return_url)
        .await
        .map_err(billing_error)?;

    Ok(Json(session))
}

pub async fn create_checkout_session(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<CreateCheckoutRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    ensure_admin_access(&state.pool, org_id, ctx.user.id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required"))?;

    let billing = state.billing().provider().ok_or_else(|| {
        ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "Billing not configured")
    })?;

    let session = billing
        .create_checkout_session(org_id, &payload.success_url, &payload.cancel_url)
        .await
        .map_err(billing_error)?;

    Ok(Json(session))
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
