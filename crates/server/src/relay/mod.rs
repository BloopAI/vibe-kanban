//! Unified relay client module.
//!
//! All communication with the relay server is routed through this module.
//! URL construction, authentication, and transport are encapsulated here
//! so no other module needs to know about relay URL patterns.

pub mod client;
pub mod host;

/// Resolve the relay API base URL from environment.
///
/// Checks runtime env first, then falls back to compile-time value
/// baked in by `build.rs`.
pub fn relay_api_base() -> Option<String> {
    std::env::var("VK_SHARED_RELAY_API_BASE")
        .ok()
        .or_else(|| option_env!("VK_SHARED_RELAY_API_BASE").map(|s| s.to_string()))
        .map(|base| base.trim_end_matches('/').to_string())
}

/// Build the relay proxy session base URL for a given host and session.
pub fn relay_session_url(host_id: uuid::Uuid, session_id: uuid::Uuid) -> Option<String> {
    relay_api_base().map(|base| format!("{base}/v1/relay/h/{host_id}/s/{session_id}"))
}
