use std::sync::OnceLock;

/// Runtime information about the local server.
#[derive(Clone)]
pub struct ClientInfo {
    port: OnceLock<u16>,
    hostname: OnceLock<String>,
    preview_proxy_port: OnceLock<u16>,
}

impl Default for ClientInfo {
    fn default() -> Self {
        Self::new()
    }
}

impl ClientInfo {
    pub fn new() -> Self {
        Self {
            port: OnceLock::new(),
            hostname: OnceLock::new(),
            preview_proxy_port: OnceLock::new(),
        }
    }

    pub fn set_port(&self, port: u16) -> Result<(), String> {
        self.port
            .set(port)
            .map_err(|_| "port already set".to_string())
    }

    pub fn get_port(&self) -> Option<u16> {
        self.port.get().copied()
    }

    pub fn set_hostname(&self, hostname: String) -> Result<(), String> {
        self.hostname
            .set(hostname)
            .map_err(|_| "hostname already set".to_string())
    }

    pub fn get_hostname(&self) -> Option<String> {
        self.hostname.get().cloned()
    }

    pub fn set_preview_proxy_port(&self, port: u16) -> Result<(), String> {
        self.preview_proxy_port
            .set(port)
            .map_err(|_| "preview proxy port already set".to_string())
    }

    pub fn get_preview_proxy_port(&self) -> Option<u16> {
        self.preview_proxy_port.get().copied()
    }
}

#[cfg(test)]
mod tests {
    use super::ClientInfo;

    #[test]
    fn stores_client_port() {
        let client_info = ClientInfo::new();

        assert_eq!(client_info.get_port(), None);

        client_info.set_port(3000).unwrap();

        assert_eq!(client_info.get_port(), Some(3000));
    }

    #[test]
    fn rejects_resetting_client_port() {
        let client_info = ClientInfo::new();

        client_info.set_port(3000).unwrap();

        assert_eq!(
            client_info.set_port(4000),
            Err("port already set".to_string())
        );
        assert_eq!(client_info.get_port(), Some(3000));
    }

    #[test]
    fn stores_client_hostname() {
        let client_info = ClientInfo::new();

        assert_eq!(client_info.get_hostname(), None);

        client_info.set_hostname("127.0.0.1".to_string()).unwrap();

        assert_eq!(client_info.get_hostname().as_deref(), Some("127.0.0.1"));
    }

    #[test]
    fn rejects_resetting_client_hostname() {
        let client_info = ClientInfo::new();

        client_info.set_hostname("127.0.0.1".to_string()).unwrap();

        assert_eq!(
            client_info.set_hostname("0.0.0.0".to_string()),
            Err("hostname already set".to_string())
        );
        assert_eq!(client_info.get_hostname().as_deref(), Some("127.0.0.1"));
    }
}
