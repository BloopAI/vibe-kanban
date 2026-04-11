pub mod signing;

use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

/// Controls the lifecycle of the relay tunnel connection.
///
/// Start/stop can be called from login/logout handlers to dynamically
/// manage the relay without restarting the server.
pub struct RelayControl {
    /// Token used to cancel the current relay connection
    shutdown: RwLock<Option<CancellationToken>>,
}

impl Default for RelayControl {
    fn default() -> Self {
        Self::new()
    }
}

impl RelayControl {
    pub fn new() -> Self {
        Self {
            shutdown: RwLock::new(None),
        }
    }

    /// Create a new cancellation token for a relay session.
    /// Cancels any previously running session first.
    pub async fn reset(&self) -> CancellationToken {
        let mut guard = self.shutdown.write().await;
        if let Some(old) = guard.take() {
            old.cancel();
        }
        let token = CancellationToken::new();
        *guard = Some(token.clone());
        token
    }

    /// Cancel the current relay session if one is running.
    pub async fn stop(&self) {
        let mut guard = self.shutdown.write().await;
        if let Some(token) = guard.take() {
            token.cancel();
        }
    }
}
