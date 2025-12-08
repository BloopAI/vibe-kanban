use serde::Serialize;

/// Build information embedded at compile time
#[derive(Debug, Clone, Serialize)]
pub struct BuildInfo {
    pub version: &'static str,
    pub git_commit: &'static str,
    pub git_branch: &'static str,
    pub build_timestamp: &'static str,
}

/// Helper macro to unwrap option_env with a default value
macro_rules! option_env_or {
    ($name:expr, $default:expr) => {
        match option_env!($name) {
            Some(v) => v,
            None => $default,
        }
    };
}

/// Static build information - populated at compile time via build.rs
pub const BUILD_INFO: BuildInfo = BuildInfo {
    version: env!("CARGO_PKG_VERSION"),
    git_commit: option_env_or!("VK_GIT_COMMIT", "unknown"),
    git_branch: option_env_or!("VK_GIT_BRANCH", "unknown"),
    build_timestamp: option_env_or!("VK_BUILD_TIMESTAMP", "unknown"),
};
