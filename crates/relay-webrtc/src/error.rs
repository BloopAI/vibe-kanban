use thiserror::Error;

#[derive(Debug, Error)]
pub enum WebRtcError {
    #[error("WebRTC operation failed: {0}")]
    WebRtc(#[from] webrtc::Error),
    #[error("ICE gathering timed out")]
    IceGatheringTimedOut,
    #[error("ICE gathering completion channel dropped")]
    IceGatheringChannelDropped,
    #[error("No local description after ICE gathering")]
    NoLocalDescription,
    #[error("No active peer for session {session_id}")]
    SessionNotFound { session_id: String },
    #[error("Failed to serialize data-channel message: {0}")]
    SerializeMessage(#[from] serde_json::Error),
    #[error(transparent)]
    ConnectUpstreamWs(#[from] ws_bridge::UpstreamWsConnectError),
    #[error("WebRTC data-channel send queue is closed")]
    DataChannelSendQueueClosed,
    #[error(transparent)]
    WsBridge(#[from] ws_bridge::WsBridgeError),
}
