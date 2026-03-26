use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;

use crate::{
    WebRtcError,
    peer::{self, PeerConfig, PeerHandle},
    signaling::{IceCandidate, SdpAnswer, SdpOffer},
};

/// Manages WebRTC peer connections for the local host.
///
/// Accepts SDP offers from remote peers, creates peer connections, and runs
/// tasks that proxy data channel traffic to the local backend.
pub struct WebRtcHost {
    inner: Arc<Mutex<WebRtcHostInner>>,
}

struct WebRtcHostInner {
    peers: HashMap<String, PeerHandle>,
    local_backend_addr: SocketAddr,
    shutdown: CancellationToken,
}

impl WebRtcHost {
    pub fn new(local_backend_addr: SocketAddr, shutdown: CancellationToken) -> Self {
        Self {
            inner: Arc::new(Mutex::new(WebRtcHostInner {
                peers: HashMap::new(),
                local_backend_addr,
                shutdown,
            })),
        }
    }

    /// Accept an SDP offer and return an SDP answer.
    ///
    /// Creates a new peer connection and spawns its event loop task.
    pub async fn handle_offer(&self, offer: SdpOffer) -> Result<SdpAnswer, WebRtcError> {
        let (answer_sdp, peer_connection) = peer::accept_offer(&offer.sdp).await?;
        let session_id = offer.session_id.clone();

        let (old_peer, peer_shutdown, local_backend_addr) = {
            let mut inner = self.inner.lock().await;
            let old_peer = inner.peers.remove(&session_id);
            let peer_shutdown = inner.shutdown.child_token();
            let local_backend_addr = inner.local_backend_addr;

            let handle = PeerHandle {
                peer_connection: peer_connection.clone(),
                shutdown: peer_shutdown.clone(),
            };
            inner.peers.insert(session_id.clone(), handle);
            (old_peer, peer_shutdown, local_backend_addr)
        };

        let inner_ref = Arc::clone(&self.inner);

        // Clean up any existing peer with the same session ID.
        if let Some(old_peer) = old_peer {
            old_peer.shutdown.cancel();
            let _ = old_peer.peer_connection.close().await;
        }

        tokio::spawn(async move {
            let config = PeerConfig {
                local_backend_addr,
                shutdown: peer_shutdown,
            };

            if let Err(e) = peer::run_peer(peer_connection, config).await {
                tracing::warn!(?e, %session_id, "WebRTC peer task failed");
            }

            // Remove self from the peer map on exit.
            let mut inner = inner_ref.lock().await;
            inner.peers.remove(&session_id);
        });

        Ok(SdpAnswer {
            sdp: answer_sdp,
            session_id: offer.session_id,
        })
    }

    /// Add a trickle ICE candidate for an active peer session.
    pub async fn add_ice_candidate(&self, candidate: IceCandidate) -> Result<(), WebRtcError> {
        let peer_connection = {
            let inner = self.inner.lock().await;
            inner
                .peers
                .get(&candidate.session_id)
                .map(|peer| peer.peer_connection.clone())
                .ok_or_else(|| WebRtcError::SessionNotFound {
                    session_id: candidate.session_id.clone(),
                })?
        };

        let init = RTCIceCandidateInit {
            candidate: candidate.candidate,
            sdp_mid: candidate.sdp_mid,
            sdp_mline_index: candidate.sdp_m_line_index.map(|v| v as u16),
            ..Default::default()
        };

        peer_connection.add_ice_candidate(init).await?;

        Ok(())
    }
}
