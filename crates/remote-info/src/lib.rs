use std::sync::OnceLock;

/// Runtime information about configured remote endpoints.
#[derive(Clone)]
pub struct RemoteInfo {
    api_base: OnceLock<String>,
    relay_api_base: OnceLock<String>,
}

impl Default for RemoteInfo {
    fn default() -> Self {
        Self::new()
    }
}

impl RemoteInfo {
    pub fn new() -> Self {
        Self {
            api_base: OnceLock::new(),
            relay_api_base: OnceLock::new(),
        }
    }

    pub fn set_api_base(&self, api_base: String) -> Result<(), String> {
        self.api_base
            .set(api_base)
            .map_err(|_| "api_base already set".to_string())
    }

    pub fn get_api_base(&self) -> Option<String> {
        self.api_base.get().cloned()
    }

    pub fn set_relay_api_base(&self, relay_api_base: String) -> Result<(), String> {
        self.relay_api_base
            .set(relay_api_base)
            .map_err(|_| "relay_api_base already set".to_string())
    }

    pub fn get_relay_api_base(&self) -> Option<String> {
        self.relay_api_base.get().cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::RemoteInfo;

    #[test]
    fn stores_remote_endpoints() {
        let remote_info = RemoteInfo::new();

        assert_eq!(remote_info.get_api_base(), None);
        assert_eq!(remote_info.get_relay_api_base(), None);

        remote_info
            .set_api_base("https://api.example.com".to_string())
            .unwrap();
        remote_info
            .set_relay_api_base("https://relay.example.com".to_string())
            .unwrap();

        assert_eq!(
            remote_info.get_api_base().as_deref(),
            Some("https://api.example.com")
        );
        assert_eq!(
            remote_info.get_relay_api_base().as_deref(),
            Some("https://relay.example.com")
        );
    }
}
