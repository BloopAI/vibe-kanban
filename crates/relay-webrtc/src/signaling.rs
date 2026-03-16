use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// SDP offer from a peer requesting a WebRTC connection.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SdpOffer {
    /// The SDP string from the peer's `RTCPeerConnection.createOffer()`.
    pub sdp: String,
    /// Caller-provided session identifier to correlate offer/answer/candidates.
    pub session_id: String,
}

/// SDP answer returned by the local host after accepting an offer.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SdpAnswer {
    /// The SDP string from `Rtc::direct_api().create_answer()`.
    pub sdp: String,
    /// Echoed session identifier from the offer.
    pub session_id: String,
}

/// A trickle ICE candidate exchanged between peers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IceCandidate {
    /// The ICE candidate string (SDP format).
    pub candidate: String,
    /// SDP media stream identification tag.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sdp_mid: Option<String>,
    /// Index of the media description in the SDP.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sdp_m_line_index: Option<u32>,
    /// Session identifier to correlate with the correct peer.
    pub session_id: String,
}
