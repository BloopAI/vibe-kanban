mod request_auth;
mod socket;
mod tunnel;

use ed25519_dalek::{SigningKey, VerifyingKey};
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use self::request_auth::RequestAuthenticator;
pub use self::{socket::RelaySocket, tunnel::RelayTunnel};

pub(crate) type RelayWsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

#[derive(Debug)]
pub enum RelayWsConnectError {
    AuthFailure,
    Other(anyhow::Error),
}

#[derive(Clone)]
pub struct RelaySession {
    relay_session_base_url: String,
    signing_key: SigningKey,
    signing_session_id: String,
    server_verify_key: VerifyingKey,
}

impl RelaySession {
    pub fn new(
        relay_session_base_url: impl Into<String>,
        signing_key: SigningKey,
        signing_session_id: impl Into<String>,
        server_verify_key: VerifyingKey,
    ) -> Self {
        Self {
            relay_session_base_url: relay_session_base_url.into(),
            signing_key,
            signing_session_id: signing_session_id.into(),
            server_verify_key,
        }
    }

    pub async fn connect_socket(
        &self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<(RelaySocket, Option<String>), RelayWsConnectError> {
        let connected = self.request_auth().connect(target_path, protocols).await?;

        Ok((
            RelaySocket::new(
                self.signing_session_id.clone(),
                connected.request_nonce,
                self.signing_key.clone(),
                self.server_verify_key,
                connected.stream,
            ),
            connected.selected_protocol,
        ))
    }

    pub async fn connect_tunnel(
        &self,
        target_path: &str,
    ) -> Result<RelayTunnel, RelayWsConnectError> {
        let connected = self.request_auth().connect(target_path, None).await?;

        Ok(RelayTunnel::new(
            self.signing_session_id.clone(),
            connected.request_nonce,
            self.signing_key.clone(),
            self.server_verify_key,
            connected.stream,
        ))
    }

    fn request_auth(&self) -> RequestAuthenticator {
        RequestAuthenticator::new(
            &self.relay_session_base_url,
            &self.signing_key,
            &self.signing_session_id,
        )
    }
}
