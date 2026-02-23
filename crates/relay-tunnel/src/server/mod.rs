mod control;
mod http;
mod subdomain;
pub mod tcp;

use std::sync::Arc;

use tokio::sync::Mutex;
use tokio_yamux::Control;

pub type SharedControl = Arc<Mutex<Control>>;

pub use control::{read_server_message, run_control_channel, write_server_message};
pub use http::proxy_request_over_control;
pub use subdomain::extract_relay_subdomain;
pub use tcp::open_tcp_tunnel;
