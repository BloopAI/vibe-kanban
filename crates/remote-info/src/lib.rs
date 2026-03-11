use tokio::sync::RwLock;

/// Runtime information about configured remote endpoints.
pub struct RemoteInfo {
    api_base: RwLock<Option<String>>,
    relay_api_base: RwLock<Option<String>>,
}

impl Default for RemoteInfo {
    fn default() -> Self {
        Self::new()
    }
}

impl RemoteInfo {
    pub fn new() -> Self {
        Self {
            api_base: RwLock::new(None),
            relay_api_base: RwLock::new(None),
        }
    }

    pub async fn set_api_base(&self, api_base: String) {
        *self.api_base.write().await = Some(api_base);
    }

    pub async fn get_api_base(&self) -> Option<String> {
        self.api_base.read().await.clone()
    }

    pub async fn set_relay_api_base(&self, relay_api_base: String) {
        *self.relay_api_base.write().await = Some(relay_api_base);
    }

    pub async fn get_relay_api_base(&self) -> Option<String> {
        self.relay_api_base.read().await.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::RemoteInfo;

    #[tokio::test]
    async fn stores_remote_endpoints() {
        let remote_info = RemoteInfo::new();

        assert_eq!(remote_info.get_api_base().await, None);
        assert_eq!(remote_info.get_relay_api_base().await, None);

        remote_info
            .set_api_base("https://api.example.com".to_string())
            .await;
        remote_info
            .set_relay_api_base("https://relay.example.com".to_string())
            .await;

        assert_eq!(
            remote_info.get_api_base().await.as_deref(),
            Some("https://api.example.com")
        );
        assert_eq!(
            remote_info.get_relay_api_base().await.as_deref(),
            Some("https://relay.example.com")
        );
    }
}
