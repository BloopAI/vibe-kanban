use tokio::sync::RwLock;

/// Runtime information about the local server (port, hostname).
pub struct ServerInfo {
    port: RwLock<Option<u16>>,
    hostname: RwLock<Option<String>>,
}

impl Default for ServerInfo {
    fn default() -> Self {
        Self::new()
    }
}

impl ServerInfo {
    pub fn new() -> Self {
        Self {
            port: RwLock::new(None),
            hostname: RwLock::new(None),
        }
    }

    pub async fn set_port(&self, port: u16) {
        *self.port.write().await = Some(port);
    }

    pub async fn get_port(&self) -> Option<u16> {
        *self.port.read().await
    }

    pub async fn set_hostname(&self, hostname: String) {
        *self.hostname.write().await = Some(hostname);
    }

    pub async fn get_hostname(&self) -> Option<String> {
        self.hostname.read().await.clone()
    }
}
