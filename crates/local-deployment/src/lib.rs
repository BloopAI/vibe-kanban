use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use api_types::LoginStatus;
use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use db::DBService;
use deployment::{Deployment, DeploymentError, RemoteClientNotConfigured};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use executors::profile::ExecutorConfigs;
use git::GitService;
use services::services::{
    analytics::{AnalyticsConfig, AnalyticsContext, AnalyticsService, generate_user_id},
    approvals::Approvals,
    auth::AuthContext,
    config::{Config, load_config_from_file, save_config_to_file},
    container::ContainerService,
    events::EventService,
    file_search::FileSearchCache,
    filesystem::FilesystemService,
    image::ImageService,
    oauth_credentials::OAuthCredentials,
    pr_monitor::PrMonitorService,
    queued_message::QueuedMessageService,
    remote_client::{RemoteClient, RemoteClientError},
    repo::RepoService,
    worktree_manager::WorktreeManager,
};
use tokio::sync::RwLock;
use trusted_key_auth::runtime::TrustedKeyAuthRuntime;
use utils::{
    assets::{config_path, credentials_path},
    msg_store::MsgStore,
};
use uuid::Uuid;

use crate::{container::LocalContainerService, pty::PtyService};
mod command;
pub mod container;
mod copy;
pub mod pty;

#[derive(Clone)]
pub struct LocalDeployment {
    config: Arc<RwLock<Config>>,
    user_id: String,
    db: DBService,
    analytics: Option<AnalyticsService>,
    container: LocalContainerService,
    git: GitService,
    repo: RepoService,
    image: ImageService,
    filesystem: FilesystemService,
    events: EventService,
    file_search_cache: Arc<FileSearchCache>,
    approvals: Approvals,
    queued_message_service: QueuedMessageService,
    remote_client: Result<RemoteClient, RemoteClientNotConfigured>,
    shared_api_base: Option<String>,
    auth_context: AuthContext,
    oauth_handoffs: Arc<RwLock<HashMap<Uuid, PendingHandoff>>>,
    trusted_key_auth: TrustedKeyAuthRuntime,
    relay_signing_sessions: Arc<RwLock<HashMap<Uuid, RelaySigningSession>>>,
    pty: PtyService,
}

#[derive(Debug, Clone)]
struct PendingHandoff {
    provider: String,
    app_verifier: String,
}

struct RelaySigningSession {
    browser_public_key: VerifyingKey,
    server_signing_key: SigningKey,
    created_at: Instant,
    last_used_at: Instant,
    seen_nonces: HashMap<String, Instant>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelaySignatureValidationError {
    TimestampOutOfDrift,
    MissingSigningSession,
    InvalidNonce,
    ReplayNonce,
    InvalidSignature,
}

impl RelaySignatureValidationError {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TimestampOutOfDrift => "timestamp outside drift window",
            Self::MissingSigningSession => "missing or expired signing session",
            Self::InvalidNonce => "invalid nonce",
            Self::ReplayNonce => "replayed nonce",
            Self::InvalidSignature => "invalid signature",
        }
    }
}

const RELAY_SIGNATURE_MAX_TIMESTAMP_DRIFT_SECS: i64 = 30;
const RELAY_SIGNING_SESSION_TTL: Duration = Duration::from_secs(60 * 60);
const RELAY_SIGNING_SESSION_IDLE_TTL: Duration = Duration::from_secs(15 * 60);
const RELAY_NONCE_TTL: Duration = Duration::from_secs(2 * 60);

#[async_trait]
impl Deployment for LocalDeployment {
    async fn new() -> Result<Self, DeploymentError> {
        // Run one-time process logs migration from DB to filesystem
        services::services::execution_process::migrate_execution_logs_to_files()
            .await
            .map_err(|e| DeploymentError::Other(anyhow::anyhow!("Migration failed: {}", e)))?;

        let mut raw_config = load_config_from_file(&config_path()).await;

        let profiles = ExecutorConfigs::get_cached();
        if !raw_config.onboarding_acknowledged
            && let Ok(recommended_executor) = profiles.get_recommended_executor_profile().await
        {
            raw_config.executor_profile = recommended_executor;
        }

        // Check if app version has changed and set release notes flag
        {
            let current_version = utils::version::APP_VERSION;
            let stored_version = raw_config.last_app_version.as_deref();

            if stored_version != Some(current_version) {
                // Show release notes only if this is an upgrade (not first install)
                raw_config.show_release_notes = stored_version.is_some();
                raw_config.last_app_version = Some(current_version.to_string());
            }
        }

        // Always save config (may have been migrated or version updated)
        save_config_to_file(&raw_config, &config_path()).await?;

        if let Some(workspace_dir) = &raw_config.workspace_dir {
            let path = utils::path::expand_tilde(workspace_dir);
            WorktreeManager::set_workspace_dir_override(path);
        }

        let config = Arc::new(RwLock::new(raw_config));
        let user_id = generate_user_id();
        let analytics = AnalyticsConfig::new().map(AnalyticsService::new);
        let git = GitService::new();
        let repo = RepoService::new();
        let msg_stores = Arc::new(RwLock::new(HashMap::new()));
        let filesystem = FilesystemService::new();

        // Create shared components for EventService
        let events_msg_store = Arc::new(MsgStore::new());
        let events_entry_count = Arc::new(RwLock::new(0));

        // Create DB with event hooks
        let db = {
            let hook = EventService::create_hook(
                events_msg_store.clone(),
                events_entry_count.clone(),
                DBService::new().await?, // Temporary DB service for the hook
            );
            DBService::new_with_after_connect(hook).await?
        };

        let image = ImageService::new(db.clone().pool)?;
        {
            let image_service = image.clone();
            tokio::spawn(async move {
                tracing::info!("Starting orphaned image cleanup...");
                if let Err(e) = image_service.delete_orphaned_images().await {
                    tracing::error!("Failed to clean up orphaned images: {}", e);
                }
            });
        }

        let approvals = Approvals::new();
        let queued_message_service = QueuedMessageService::new();

        let oauth_credentials = Arc::new(OAuthCredentials::new(credentials_path()));
        if let Err(e) = oauth_credentials.load().await {
            tracing::warn!(?e, "failed to load OAuth credentials");
        }

        let profile_cache = Arc::new(RwLock::new(None));
        let auth_context = AuthContext::new(oauth_credentials.clone(), profile_cache.clone());

        let api_base = std::env::var("VK_SHARED_API_BASE")
            .ok()
            .or_else(|| option_env!("VK_SHARED_API_BASE").map(|s| s.to_string()));

        let remote_client = match &api_base {
            Some(url) => match RemoteClient::new(url, auth_context.clone()) {
                Ok(client) => {
                    tracing::info!("Remote client initialized with URL: {}", url);
                    Ok(client)
                }
                Err(e) => {
                    tracing::error!(?e, "failed to create remote client");
                    Err(RemoteClientNotConfigured)
                }
            },
            None => {
                tracing::info!("VK_SHARED_API_BASE not set; remote features disabled");
                Err(RemoteClientNotConfigured)
            }
        };

        let oauth_handoffs = Arc::new(RwLock::new(HashMap::new()));
        let trusted_key_auth = TrustedKeyAuthRuntime::new();
        let relay_signing_sessions = Arc::new(RwLock::new(HashMap::new()));

        // We need to make analytics accessible to the ContainerService
        // TODO: Handle this more gracefully
        let analytics_ctx = analytics.as_ref().map(|s| AnalyticsContext {
            user_id: user_id.clone(),
            analytics_service: s.clone(),
        });
        let container = LocalContainerService::new(
            db.clone(),
            msg_stores.clone(),
            config.clone(),
            git.clone(),
            image.clone(),
            analytics_ctx,
            approvals.clone(),
            queued_message_service.clone(),
            remote_client.clone().ok(),
        )
        .await;

        let events = EventService::new(db.clone(), events_msg_store, events_entry_count);

        let file_search_cache = Arc::new(FileSearchCache::new());

        let pty = PtyService::new();
        {
            let db = db.clone();
            let analytics = analytics.as_ref().map(|s| AnalyticsContext {
                user_id: user_id.clone(),
                analytics_service: s.clone(),
            });
            let container = container.clone();
            let rc = remote_client.clone().ok();
            PrMonitorService::spawn(db, analytics, container, rc).await;
        }

        let deployment = Self {
            config,
            user_id,
            db,
            analytics,
            container,
            git,
            repo,
            image,
            filesystem,
            events,
            file_search_cache,
            approvals,
            queued_message_service,
            remote_client,
            shared_api_base: api_base,
            auth_context,
            oauth_handoffs,
            trusted_key_auth,
            relay_signing_sessions,
            pty,
        };

        Ok(deployment)
    }

    fn user_id(&self) -> &str {
        &self.user_id
    }

    fn config(&self) -> &Arc<RwLock<Config>> {
        &self.config
    }

    fn db(&self) -> &DBService {
        &self.db
    }

    fn analytics(&self) -> &Option<AnalyticsService> {
        &self.analytics
    }

    fn container(&self) -> &impl ContainerService {
        &self.container
    }

    fn git(&self) -> &GitService {
        &self.git
    }

    fn repo(&self) -> &RepoService {
        &self.repo
    }

    fn image(&self) -> &ImageService {
        &self.image
    }

    fn filesystem(&self) -> &FilesystemService {
        &self.filesystem
    }

    fn events(&self) -> &EventService {
        &self.events
    }

    fn file_search_cache(&self) -> &Arc<FileSearchCache> {
        &self.file_search_cache
    }

    fn approvals(&self) -> &Approvals {
        &self.approvals
    }

    fn queued_message_service(&self) -> &QueuedMessageService {
        &self.queued_message_service
    }

    fn auth_context(&self) -> &AuthContext {
        &self.auth_context
    }

    fn shared_api_base(&self) -> Option<String> {
        self.shared_api_base.clone()
    }
}

impl LocalDeployment {
    pub fn remote_client(&self) -> Result<RemoteClient, RemoteClientNotConfigured> {
        self.remote_client.clone()
    }

    pub async fn get_login_status(&self) -> LoginStatus {
        if self.auth_context.get_credentials().await.is_none() {
            self.auth_context.clear_profile().await;
            return LoginStatus::LoggedOut;
        };

        if let Some(cached_profile) = self.auth_context.cached_profile().await {
            return LoginStatus::LoggedIn {
                profile: cached_profile,
            };
        }

        let Ok(client) = self.remote_client() else {
            return LoginStatus::LoggedOut;
        };

        match client.profile().await {
            Ok(profile) => {
                self.auth_context.set_profile(profile.clone()).await;
                LoginStatus::LoggedIn { profile }
            }
            Err(RemoteClientError::Auth) => {
                let _ = self.auth_context.clear_credentials().await;
                self.auth_context.clear_profile().await;
                LoginStatus::LoggedOut
            }
            Err(_) => LoginStatus::LoggedOut,
        }
    }

    pub async fn store_oauth_handoff(
        &self,
        handoff_id: Uuid,
        provider: String,
        app_verifier: String,
    ) {
        self.oauth_handoffs.write().await.insert(
            handoff_id,
            PendingHandoff {
                provider,
                app_verifier,
            },
        );
    }

    pub async fn take_oauth_handoff(&self, handoff_id: &Uuid) -> Option<(String, String)> {
        self.oauth_handoffs
            .write()
            .await
            .remove(handoff_id)
            .map(|state| (state.provider, state.app_verifier))
    }

    pub async fn store_pake_enrollment(&self, enrollment_id: Uuid, shared_key: Vec<u8>) {
        self.trusted_key_auth
            .store_pake_enrollment(enrollment_id, shared_key)
            .await;
    }

    pub async fn take_pake_enrollment(&self, enrollment_id: &Uuid) -> Option<Vec<u8>> {
        self.trusted_key_auth
            .take_pake_enrollment(enrollment_id)
            .await
    }

    pub async fn get_or_set_enrollment_code(&self, new_code: String) -> String {
        self.trusted_key_auth
            .get_or_set_enrollment_code(new_code)
            .await
    }

    pub async fn consume_enrollment_code(&self, enrollment_code: &str) -> bool {
        self.trusted_key_auth
            .consume_enrollment_code(enrollment_code)
            .await
    }

    pub async fn allow_rate_limited_action(
        &self,
        bucket: &str,
        max_requests: usize,
        window: Duration,
    ) -> bool {
        self.trusted_key_auth
            .allow_rate_limited_action(bucket, max_requests, window)
            .await
    }

    pub async fn create_relay_signing_session(
        &self,
        browser_public_key: VerifyingKey,
        server_signing_key: SigningKey,
    ) -> Uuid {
        let signing_session_id = Uuid::new_v4();
        let now = Instant::now();
        let mut sessions = self.relay_signing_sessions.write().await;
        sessions.insert(
            signing_session_id,
            RelaySigningSession {
                browser_public_key,
                server_signing_key,
                created_at: now,
                last_used_at: now,
                seen_nonces: HashMap::new(),
            },
        );
        signing_session_id
    }

    pub async fn verify_relay_message(
        &self,
        signing_session_id: Uuid,
        timestamp: i64,
        nonce: &str,
        message: &[u8],
        signature_b64: &str,
    ) -> Result<(), RelaySignatureValidationError> {
        if nonce.trim().is_empty() || nonce.len() > 128 {
            return Err(RelaySignatureValidationError::InvalidNonce);
        }

        validate_timestamp(timestamp)?;

        let signature = parse_signature_b64(signature_b64)?;
        let mut sessions = self.relay_signing_sessions.write().await;
        let session = get_valid_session(&mut sessions, signing_session_id)?;

        session
            .seen_nonces
            .retain(|_, seen_at| Instant::now().duration_since(*seen_at) <= RELAY_NONCE_TTL);
        if session.seen_nonces.contains_key(nonce) {
            return Err(RelaySignatureValidationError::ReplayNonce);
        }

        session
            .browser_public_key
            .verify(message, &signature)
            .map_err(|_| RelaySignatureValidationError::InvalidSignature)?;

        session.seen_nonces.insert(nonce.to_string(), Instant::now());
        session.last_used_at = Instant::now();

        Ok(())
    }

    pub async fn sign_relay_message(
        &self,
        signing_session_id: Uuid,
        message: &[u8],
    ) -> Result<String, RelaySignatureValidationError> {
        let mut sessions = self.relay_signing_sessions.write().await;
        let session = get_valid_session(&mut sessions, signing_session_id)?;
        session.last_used_at = Instant::now();

        let signature = session.server_signing_key.sign(message);
        Ok(BASE64_STANDARD.encode(signature.to_bytes()))
    }

    pub async fn verify_relay_signature(
        &self,
        signing_session_id: Uuid,
        message: &[u8],
        signature_b64: &str,
    ) -> Result<(), RelaySignatureValidationError> {
        let signature = parse_signature_b64(signature_b64)?;
        let mut sessions = self.relay_signing_sessions.write().await;
        let session = get_valid_session(&mut sessions, signing_session_id)?;

        session
            .browser_public_key
            .verify(message, &signature)
            .map_err(|_| RelaySignatureValidationError::InvalidSignature)?;

        session.last_used_at = Instant::now();
        Ok(())
    }

    pub fn pty(&self) -> &PtyService {
        &self.pty
    }
}

fn get_valid_session(
    sessions: &mut HashMap<Uuid, RelaySigningSession>,
    signing_session_id: Uuid,
) -> Result<&mut RelaySigningSession, RelaySignatureValidationError> {
    let now = Instant::now();
    sessions.retain(|_, session| {
        now.duration_since(session.created_at) <= RELAY_SIGNING_SESSION_TTL
            && now.duration_since(session.last_used_at) <= RELAY_SIGNING_SESSION_IDLE_TTL
    });
    sessions
        .get_mut(&signing_session_id)
        .ok_or(RelaySignatureValidationError::MissingSigningSession)
}

fn validate_timestamp(timestamp: i64) -> Result<(), RelaySignatureValidationError> {
    let now_secs = i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| RelaySignatureValidationError::TimestampOutOfDrift)?
            .as_secs(),
    )
    .map_err(|_| RelaySignatureValidationError::TimestampOutOfDrift)?;

    let drift_secs = now_secs.saturating_sub(timestamp).abs();
    if drift_secs > RELAY_SIGNATURE_MAX_TIMESTAMP_DRIFT_SECS {
        return Err(RelaySignatureValidationError::TimestampOutOfDrift);
    }
    Ok(())
}

fn parse_signature_b64(signature_b64: &str) -> Result<Signature, RelaySignatureValidationError> {
    let sig_bytes = BASE64_STANDARD
        .decode(signature_b64)
        .map_err(|_| RelaySignatureValidationError::InvalidSignature)?;
    Signature::from_slice(&sig_bytes).map_err(|_| RelaySignatureValidationError::InvalidSignature)
}
