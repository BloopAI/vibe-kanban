use anyhow::Context as _;
use ed25519_dalek::SigningKey;
use relay_control::signing::{
    self, NONCE_HEADER, REQUEST_SIGNATURE_HEADER, RequestSignature, SIGNING_SESSION_HEADER,
    TIMESTAMP_HEADER,
};
use relay_tunnel::{http_to_ws_url, tls::ws_connector};
use relay_ws_protocol::RELAY_HEADER;
use tokio_tungstenite::{
    connect_async_tls_with_config,
    tungstenite::{self, client::IntoClientRequest},
};

use crate::{RelayWsConnectError, RelayWsStream};

pub(crate) struct ConnectedRelayWs {
    pub(crate) stream: RelayWsStream,
    pub(crate) selected_protocol: Option<String>,
    pub(crate) request_nonce: String,
}

pub(crate) struct RequestAuthenticator {
    relay_session_base_url: String,
    signing_key: SigningKey,
    signing_session_id: String,
}

impl RequestAuthenticator {
    pub(crate) fn new(
        relay_session_base_url: &str,
        signing_key: &SigningKey,
        signing_session_id: &str,
    ) -> Self {
        Self {
            relay_session_base_url: relay_session_base_url.to_string(),
            signing_key: signing_key.clone(),
            signing_session_id: signing_session_id.to_string(),
        }
    }

    pub(crate) async fn connect(
        &self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<ConnectedRelayWs, RelayWsConnectError> {
        let request_signature = signing::build_request_signature(
            &self.signing_key,
            &self.signing_session_id,
            "GET",
            target_path,
            &[],
        );
        let ws_url = http_to_ws_url(&format!(
            "{}{}",
            self.relay_session_base_url.trim_end_matches('/'),
            target_path
        ))
        .map_err(RelayWsConnectError::Other)?;

        let mut ws_request = ws_url
            .into_client_request()
            .context("Failed to build relay upstream WS request")
            .map_err(RelayWsConnectError::Other)?;

        if let Some(value) = protocols {
            ws_request.headers_mut().insert(
                "sec-websocket-protocol",
                value
                    .parse()
                    .map_err(anyhow::Error::from)
                    .map_err(RelayWsConnectError::Other)?,
            );
        }

        set_ws_signing_headers(ws_request.headers_mut(), &request_signature);

        let (stream, response) =
            match connect_async_tls_with_config(ws_request, None, false, ws_connector()).await {
                Ok(result) => result,
                Err(tungstenite::Error::Http(response)) => {
                    let status = response.status();
                    if is_auth_failure_status(status) {
                        return Err(RelayWsConnectError::AuthFailure);
                    }
                    return Err(RelayWsConnectError::Other(anyhow::anyhow!(
                        "Relay WS handshake failed with status {status}"
                    )));
                }
                Err(error) => return Err(RelayWsConnectError::Other(anyhow::Error::from(error))),
            };

        let selected_protocol = response
            .headers()
            .get("sec-websocket-protocol")
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned);

        Ok(ConnectedRelayWs {
            stream,
            selected_protocol,
            request_nonce: request_signature.nonce,
        })
    }
}

fn set_ws_signing_headers(
    headers: &mut tungstenite::http::HeaderMap,
    signature: &RequestSignature,
) {
    headers.insert(RELAY_HEADER, "1".parse().expect("static header value"));
    headers.insert(
        SIGNING_SESSION_HEADER,
        signature
            .signing_session_id
            .parse()
            .expect("valid header value"),
    );
    headers.insert(
        TIMESTAMP_HEADER,
        signature
            .timestamp
            .to_string()
            .parse()
            .expect("valid header value"),
    );
    headers.insert(
        NONCE_HEADER,
        signature.nonce.parse().expect("valid header value"),
    );
    headers.insert(
        REQUEST_SIGNATURE_HEADER,
        signature.signature_b64.parse().expect("valid header value"),
    );
}

fn is_auth_failure_status(status: tungstenite::http::StatusCode) -> bool {
    status == tungstenite::http::StatusCode::UNAUTHORIZED
        || status == tungstenite::http::StatusCode::FORBIDDEN
}
