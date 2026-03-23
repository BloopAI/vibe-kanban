use std::{net::SocketAddr, sync::OnceLock};

/// Runtime information about the local server.
#[derive(Clone)]
pub struct ClientInfo {
    server_addr: OnceLock<SocketAddr>,
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
            server_addr: OnceLock::new(),
            preview_proxy_port: OnceLock::new(),
        }
    }

    pub fn set_server_addr(&self, addr: SocketAddr) -> Result<(), String> {
        self.server_addr
            .set(addr)
            .map_err(|_| "server address already set".to_string())
    }

    pub fn get_server_addr(&self) -> Option<SocketAddr> {
        self.server_addr.get().copied()
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
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

    use super::ClientInfo;

    #[test]
    fn stores_server_addr() {
        let client_info = ClientInfo::new();
        let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 3000);

        assert_eq!(client_info.get_server_addr(), None);

        client_info.set_server_addr(addr).unwrap();

        assert_eq!(client_info.get_server_addr(), Some(addr));
    }

    #[test]
    fn rejects_resetting_server_addr() {
        let client_info = ClientInfo::new();
        let addr1 = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 3000);
        let addr2 = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 4000);

        client_info.set_server_addr(addr1).unwrap();

        assert_eq!(
            client_info.set_server_addr(addr2),
            Err("server address already set".to_string())
        );
        assert_eq!(client_info.get_server_addr(), Some(addr1));
    }

    #[test]
    fn formats_ipv6_with_brackets() {
        let addr = SocketAddr::new(IpAddr::V6(Ipv6Addr::LOCALHOST), 5000);
        assert_eq!(addr.to_string(), "[::1]:5000");
    }
}
