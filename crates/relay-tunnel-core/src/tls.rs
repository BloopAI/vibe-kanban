use tokio_tungstenite::Connector;

/// Build TLS connector for the relay WebSocket client.
///
/// In debug builds, returns a connector that accepts all certificates (equivalent
/// to `danger_accept_invalid_certs`) so that Caddy's internal CA and other dev
/// certs work. In release builds, returns `None` to use the default webpki-roots
/// validation.
pub fn ws_connector() -> Option<Connector> {
    #[cfg(debug_assertions)]
    {
        use std::sync::Arc;

        let config = rustls::ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(AcceptAllCerts))
            .with_no_client_auth();
        Some(Connector::Rustls(Arc::new(config)))
    }

    #[cfg(not(debug_assertions))]
    {
        None
    }
}

#[cfg(debug_assertions)]
#[derive(Debug)]
struct AcceptAllCerts;

#[cfg(debug_assertions)]
impl rustls::client::danger::ServerCertVerifier for AcceptAllCerts {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::aws_lc_rs::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}
