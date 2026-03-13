use std::{collections::HashMap, sync::Arc};

use str0m::Candidate;
use tokio::sync::{Mutex, mpsc};
use tokio_util::sync::CancellationToken;

use crate::{
    peer::{self, PeerConfig, PeerHandle},
    signaling::{IceCandidate, SdpAnswer, SdpOffer},
};

/// Manages WebRTC peer connections for the local host.
///
/// Accepts SDP offers from remote peers, creates str0m instances, and runs
/// event loops that proxy data channel traffic to the local backend.
pub struct WebRtcHost {
    inner: Arc<Mutex<WebRtcHostInner>>,
}

struct WebRtcHostInner {
    peers: HashMap<String, PeerHandle>,
    local_backend_addr: String,
    shutdown: CancellationToken,
}

impl WebRtcHost {
    pub fn new(local_backend_addr: String, shutdown: CancellationToken) -> Self {
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
    /// The UDP socket is bound before the SDP answer is created so that
    /// the server's host candidate is included in the answer.
    pub async fn handle_offer(&self, offer: SdpOffer) -> anyhow::Result<SdpAnswer> {
        let (answer_sdp, rtc, socket) = peer::accept_offer(&offer.sdp).await?;

        let (candidate_tx, candidate_rx) = mpsc::channel(32);

        let mut inner = self.inner.lock().await;

        // Clean up any existing peer with the same session ID.
        if let Some(old_peer) = inner.peers.remove(&offer.session_id) {
            old_peer.shutdown.cancel();
        }

        let peer_shutdown = inner.shutdown.child_token();

        let handle = PeerHandle {
            candidate_tx,
            shutdown: peer_shutdown.clone(),
        };
        inner.peers.insert(offer.session_id.clone(), handle);

        let local_backend_addr = inner.local_backend_addr.clone();
        let session_id = offer.session_id.clone();
        let inner_ref = Arc::clone(&self.inner);

        tokio::spawn(async move {
            let config = PeerConfig {
                local_backend_addr,
                shutdown: peer_shutdown,
            };

            if let Err(e) = peer::run_peer(rtc, socket, config, candidate_rx).await {
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
    pub async fn add_ice_candidate(&self, candidate: IceCandidate) -> anyhow::Result<()> {
        let inner = self.inner.lock().await;

        let peer = inner.peers.get(&candidate.session_id).ok_or_else(|| {
            anyhow::anyhow!("No active peer for session {}", candidate.session_id)
        })?;

        let parsed = Candidate::from_sdp_string(&candidate.candidate)
            .map_err(|e| anyhow::anyhow!("Invalid ICE candidate: {e}"))?;

        peer.candidate_tx.send(parsed).await.map_err(|_| {
            anyhow::anyhow!("Peer task has exited for session {}", candidate.session_id)
        })?;

        Ok(())
    }

    /// Shut down and remove a specific peer.
    pub async fn remove_peer(&self, session_id: &str) {
        let mut inner = self.inner.lock().await;
        if let Some(peer) = inner.peers.remove(session_id) {
            peer.shutdown.cancel();
        }
    }

    /// Number of active peer connections.
    pub async fn peer_count(&self) -> usize {
        let inner = self.inner.lock().await;
        inner.peers.len()
    }
}
