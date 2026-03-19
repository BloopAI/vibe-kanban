use std::{sync::Arc, time::Duration};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use http::HeaderMap;
use relay_control::signing::RelaySigningService;
use relay_types::{
    FinishSpake2EnrollmentRequest, FinishSpake2EnrollmentResponse,
    RefreshRelaySigningSessionRequest, RefreshRelaySigningSessionResponse, RelayPairedClient,
    StartSpake2EnrollmentRequest, StartSpake2EnrollmentResponse,
};
use services::services::{analytics::AnalyticsService, config::Config};
use tokio::sync::RwLock;
use trusted_key_auth::{
    key_confirmation::{build_server_proof, verify_client_proof},
    refresh::{build_refresh_message, validate_refresh_timestamp, verify_refresh_signature},
    runtime::TrustedKeyAuthRuntime,
    spake2::{generate_one_time_code, start_spake2_enrollment},
    trusted_keys::{TrustedRelayClient, parse_public_key_base64},
};
use uuid::Uuid;

use crate::error::ApiError;

pub const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);
pub const GENERATE_CODE_GLOBAL_LIMIT: usize = 5;
pub const SPAKE2_START_GLOBAL_LIMIT: usize = 30;
pub const SIGNING_SESSION_REFRESH_GLOBAL_LIMIT: usize = 30;

#[derive(Clone)]
pub struct RelayPairingServer {
    trusted_key_auth: TrustedKeyAuthRuntime,
    relay_signing: RelaySigningService,
    events: RelayPairingEvents,
}

#[derive(Clone)]
pub struct RelayPairingEvents {
    user_id: String,
    config: Arc<RwLock<Config>>,
    analytics: Option<AnalyticsService>,
}

impl RelayPairingEvents {
    pub fn new(
        user_id: String,
        config: Arc<RwLock<Config>>,
        analytics: Option<AnalyticsService>,
    ) -> Self {
        Self {
            user_id,
            config,
            analytics,
        }
    }

    pub async fn track_host_paired(
        &self,
        client_id: Uuid,
        client_browser: &str,
        client_os: &str,
        client_device: &str,
    ) {
        let analytics_enabled = self.config.read().await.analytics_enabled;
        if analytics_enabled && let Some(analytics) = &self.analytics {
            analytics.track_event(
                &self.user_id,
                "relay_host_paired",
                Some(serde_json::json!({
                    "client_id": client_id,
                    "client_browser": client_browser,
                    "client_os": client_os,
                    "client_device": client_device,
                })),
            );
        }
    }
}

impl RelayPairingServer {
    pub fn new(
        trusted_key_auth: TrustedKeyAuthRuntime,
        relay_signing: RelaySigningService,
        events: RelayPairingEvents,
    ) -> Self {
        Self {
            trusted_key_auth,
            relay_signing,
            events,
        }
    }

    pub async fn generate_enrollment_code(&self) -> Result<String, ApiError> {
        self.trusted_key_auth
            .enforce_rate_limit(
                "relay-auth:code-generation:global",
                GENERATE_CODE_GLOBAL_LIMIT,
                RATE_LIMIT_WINDOW,
            )
            .await
            .map_err(ApiError::from)?;

        Ok(self
            .trusted_key_auth
            .get_or_set_enrollment_code(generate_one_time_code())
            .await)
    }

    pub async fn start_spake2_enrollment(
        &self,
        payload: StartSpake2EnrollmentRequest,
    ) -> Result<StartSpake2EnrollmentResponse, ApiError> {
        self.trusted_key_auth
            .enforce_rate_limit(
                "relay-auth:spake2-start:global",
                SPAKE2_START_GLOBAL_LIMIT,
                RATE_LIMIT_WINDOW,
            )
            .await
            .map_err(ApiError::from)?;

        let spake2_start =
            start_spake2_enrollment(&payload.enrollment_code, &payload.client_message_b64)?;

        if !self
            .trusted_key_auth
            .consume_enrollment_code(&spake2_start.enrollment_code)
            .await
        {
            return Err(ApiError::Unauthorized);
        }

        let enrollment_id = Uuid::new_v4();
        self.trusted_key_auth
            .store_pake_enrollment(enrollment_id, spake2_start.shared_key)
            .await;

        Ok(StartSpake2EnrollmentResponse {
            enrollment_id,
            server_message_b64: spake2_start.server_message_b64,
        })
    }

    pub async fn list_paired_clients(&self) -> Result<Vec<RelayPairedClient>, ApiError> {
        let clients = self.trusted_key_auth.list_trusted_clients().await?;
        Ok(clients
            .into_iter()
            .map(|client| RelayPairedClient {
                client_id: client.client_id,
                client_name: client.client_name,
                client_browser: client.client_browser,
                client_os: client.client_os,
                client_device: client.client_device,
            })
            .collect())
    }

    pub async fn remove_paired_client(&self, client_id: Uuid) -> Result<bool, ApiError> {
        self.trusted_key_auth
            .remove_trusted_client(client_id)
            .await
            .map_err(ApiError::from)
    }

    pub async fn finish_spake2_enrollment(
        &self,
        payload: FinishSpake2EnrollmentRequest,
    ) -> Result<FinishSpake2EnrollmentResponse, ApiError> {
        let Some(shared_key) = self
            .trusted_key_auth
            .take_pake_enrollment(&payload.enrollment_id)
            .await
        else {
            return Err(ApiError::Unauthorized);
        };

        let client_public_key = parse_public_key_base64(&payload.public_key_b64)
            .map_err(|_| ApiError::BadRequest("Invalid public_key_b64".to_string()))?;

        let server_public_key = self.relay_signing.server_public_key();
        let server_public_key_b64 = BASE64_STANDARD.encode(server_public_key.as_bytes());

        verify_client_proof(
            &shared_key,
            &payload.enrollment_id,
            client_public_key.as_bytes(),
            &payload.client_proof_b64,
        )
        .map_err(|_| ApiError::Unauthorized)?;

        self.trusted_key_auth
            .persist_trusted_client(TrustedRelayClient {
                client_id: payload.client_id,
                client_name: payload.client_name.clone(),
                client_browser: payload.client_browser.clone(),
                client_os: payload.client_os.clone(),
                client_device: payload.client_device.clone(),
                public_key_b64: payload.public_key_b64.clone(),
            })
            .await?;

        let signing_session_id = self.relay_signing.create_session(client_public_key).await;

        let server_proof_b64 = build_server_proof(
            &shared_key,
            &payload.enrollment_id,
            client_public_key.as_bytes(),
            server_public_key.as_bytes(),
        )
        .map_err(|_| ApiError::Unauthorized)?;

        tracing::info!(
            enrollment_id = %payload.enrollment_id,
            client_id = %payload.client_id,
            signing_session_id = %signing_session_id,
            public_key_b64 = %BASE64_STANDARD.encode(client_public_key.as_bytes()),
            "completed relay PAKE enrollment"
        );

        self.events
            .track_host_paired(
                payload.client_id,
                &payload.client_browser,
                &payload.client_os,
                &payload.client_device,
            )
            .await;

        Ok(FinishSpake2EnrollmentResponse {
            signing_session_id,
            server_public_key_b64,
            server_proof_b64,
        })
    }

    pub async fn refresh_signing_session(
        &self,
        payload: RefreshRelaySigningSessionRequest,
    ) -> Result<RefreshRelaySigningSessionResponse, ApiError> {
        self.trusted_key_auth
            .enforce_rate_limit(
                "relay-auth:signing-refresh:global",
                SIGNING_SESSION_REFRESH_GLOBAL_LIMIT,
                RATE_LIMIT_WINDOW,
            )
            .await
            .map_err(ApiError::from)?;

        let trusted_client = self
            .trusted_key_auth
            .find_trusted_client(payload.client_id)
            .await?
            .ok_or(ApiError::Unauthorized)?;

        let client_public_key = parse_public_key_base64(&trusted_client.public_key_b64)
            .map_err(|_| ApiError::Unauthorized)?;

        validate_refresh_timestamp(payload.timestamp)?;
        self.trusted_key_auth
            .claim_refresh_nonce(&payload.nonce)
            .await?;

        let refresh_message =
            build_refresh_message(payload.timestamp, &payload.nonce, payload.client_id);
        verify_refresh_signature(&client_public_key, &refresh_message, &payload.signature_b64)?;

        let signing_session_id = self.relay_signing.create_session(client_public_key).await;

        Ok(RefreshRelaySigningSessionResponse { signing_session_id })
    }
}

pub fn is_relay_request(headers: &HeaderMap) -> bool {
    headers
        .get(relay_client::RELAY_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.trim() == "1")
}
