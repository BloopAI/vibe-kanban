pub mod client;
pub mod error;
pub mod fragment;
pub mod host;
pub mod peer;
pub mod proxy;
pub mod signaling;

pub use client::{WebRtcClient, WebRtcClientError, WsConnection, WsOpenResult};
pub use error::WebRtcError;
pub use host::WebRtcHost;
pub use proxy::{
    DataChannelMessage, DataChannelRequest, DataChannelResponse, DataChannelWsStream, WsClose,
    WsError, WsFrame, WsOpen, WsOpened,
};
pub use signaling::{IceCandidate, SdpAnswer, SdpOffer};

/// Set on every request the host proxies from a WebRTC data channel to its
/// local backend, so the backend can tell it came from a paired device rather
/// than from this machine. Any copy the peer sends is dropped first.
pub const WEBRTC_PEER_HEADER: &str = "x-vk-webrtc-peer";

/// Build a webrtc API restricted to UDP4 (IPv4 only).
///
/// Without this, the ICE agent tries IPv6 STUN which times out on most
/// networks and blocks ICE gathering.
fn build_api() -> webrtc::api::API {
    use webrtc::api::setting_engine::SettingEngine;
    use webrtc_ice::network_type::NetworkType;

    let mut se = SettingEngine::default();
    se.set_network_types(vec![NetworkType::Udp4]);
    webrtc::api::APIBuilder::new()
        .with_setting_engine(se)
        .build()
}
