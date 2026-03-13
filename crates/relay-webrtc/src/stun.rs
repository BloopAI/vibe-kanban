use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};

use tokio::net::UdpSocket;

/// Default public STUN server.
const DEFAULT_STUN_SERVER: &str = "stun.l.google.com:19302";

/// STUN magic cookie (RFC 5389).
const MAGIC_COOKIE: u32 = 0x2112_A442;

/// Send a STUN binding request from `socket` and return the server-reflexive
/// (public) address as seen by the STUN server.
pub async fn stun_binding(socket: &UdpSocket) -> anyhow::Result<SocketAddr> {
    stun_binding_to(socket, DEFAULT_STUN_SERVER).await
}

async fn stun_binding_to(socket: &UdpSocket, server: &str) -> anyhow::Result<SocketAddr> {
    let server_addr: SocketAddr = tokio::net::lookup_host(server)
        .await?
        .next()
        .ok_or_else(|| anyhow::anyhow!("Failed to resolve STUN server: {server}"))?;

    // Build a minimal STUN Binding Request (20 bytes).
    // Type: 0x0001 (Binding Request), Length: 0, Magic Cookie, Transaction ID (12 random bytes).
    let mut request = [0u8; 20];
    request[0..2].copy_from_slice(&0x0001u16.to_be_bytes()); // type
    // length stays 0
    request[4..8].copy_from_slice(&MAGIC_COOKIE.to_be_bytes());
    // transaction id: 12 random bytes
    let txn_id: [u8; 12] = rand::random();
    request[8..20].copy_from_slice(&txn_id);

    socket.send_to(&request, server_addr).await?;

    let mut buf = [0u8; 512];
    let n = tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop {
            let (n, from) = socket.recv_from(&mut buf).await?;
            if from == server_addr {
                return Ok::<_, anyhow::Error>(n);
            }
        }
    })
    .await
    .map_err(|_| anyhow::anyhow!("STUN binding request timed out"))??;

    parse_stun_response(&buf[..n], &txn_id)
}

fn parse_stun_response(buf: &[u8], expected_txn_id: &[u8; 12]) -> anyhow::Result<SocketAddr> {
    if buf.len() < 20 {
        anyhow::bail!("STUN response too short");
    }

    let msg_type = u16::from_be_bytes([buf[0], buf[1]]);
    if msg_type != 0x0101 {
        anyhow::bail!("Not a STUN Binding Success Response: 0x{msg_type:04x}");
    }

    let msg_len = u16::from_be_bytes([buf[2], buf[3]]) as usize;
    if buf.len() < 20 + msg_len {
        anyhow::bail!("STUN response truncated");
    }

    if &buf[8..20] != expected_txn_id {
        anyhow::bail!("STUN transaction ID mismatch");
    }

    // Walk attributes looking for XOR-MAPPED-ADDRESS (0x0020) or MAPPED-ADDRESS (0x0001).
    let attrs = &buf[20..20 + msg_len];
    let mut offset = 0;
    while offset + 4 <= attrs.len() {
        let attr_type = u16::from_be_bytes([attrs[offset], attrs[offset + 1]]);
        let attr_len = u16::from_be_bytes([attrs[offset + 2], attrs[offset + 3]]) as usize;
        let value_start = offset + 4;
        if value_start + attr_len > attrs.len() {
            break;
        }
        let value = &attrs[value_start..value_start + attr_len];

        if attr_type == 0x0020 {
            // XOR-MAPPED-ADDRESS
            return parse_xor_mapped_address(value, buf);
        }
        if attr_type == 0x0001 {
            // MAPPED-ADDRESS (fallback)
            return parse_mapped_address(value);
        }

        // Attributes are padded to 4-byte boundaries.
        offset = value_start + ((attr_len + 3) & !3);
    }

    anyhow::bail!("No MAPPED-ADDRESS or XOR-MAPPED-ADDRESS in STUN response")
}

fn parse_xor_mapped_address(value: &[u8], header: &[u8]) -> anyhow::Result<SocketAddr> {
    if value.len() < 8 {
        anyhow::bail!("XOR-MAPPED-ADDRESS too short");
    }
    let family = value[1];
    let xport = u16::from_be_bytes([value[2], value[3]]) ^ (MAGIC_COOKIE >> 16) as u16;

    match family {
        0x01 => {
            // IPv4
            let xip = u32::from_be_bytes([value[4], value[5], value[6], value[7]]) ^ MAGIC_COOKIE;
            Ok(SocketAddr::new(Ipv4Addr::from(xip).into(), xport))
        }
        0x02 => {
            // IPv6
            if value.len() < 20 {
                anyhow::bail!("XOR-MAPPED-ADDRESS IPv6 too short");
            }
            let mut ip_bytes = [0u8; 16];
            ip_bytes.copy_from_slice(&value[4..20]);
            // XOR with magic cookie (4 bytes) + transaction ID (12 bytes)
            for (i, b) in ip_bytes.iter_mut().enumerate() {
                *b ^= header[4 + i];
            }
            Ok(SocketAddr::new(Ipv6Addr::from(ip_bytes).into(), xport))
        }
        _ => anyhow::bail!("Unknown address family in XOR-MAPPED-ADDRESS: {family}"),
    }
}

fn parse_mapped_address(value: &[u8]) -> anyhow::Result<SocketAddr> {
    if value.len() < 8 {
        anyhow::bail!("MAPPED-ADDRESS too short");
    }
    let family = value[1];
    let port = u16::from_be_bytes([value[2], value[3]]);

    match family {
        0x01 => {
            let ip = Ipv4Addr::new(value[4], value[5], value[6], value[7]);
            Ok(SocketAddr::new(ip.into(), port))
        }
        0x02 => {
            if value.len() < 20 {
                anyhow::bail!("MAPPED-ADDRESS IPv6 too short");
            }
            let mut ip_bytes = [0u8; 16];
            ip_bytes.copy_from_slice(&value[4..20]);
            Ok(SocketAddr::new(Ipv6Addr::from(ip_bytes).into(), port))
        }
        _ => anyhow::bail!("Unknown address family in MAPPED-ADDRESS: {family}"),
    }
}

/// Resolve the machine's local IP by probing the default route.
///
/// Binds a UDP socket and "connects" to an external address (no data sent)
/// to determine which local interface the OS would use.
pub fn resolve_local_ip() -> anyhow::Result<IpAddr> {
    let probe = std::net::UdpSocket::bind("0.0.0.0:0")?;
    probe.connect("8.8.8.8:80")?;
    Ok(probe.local_addr()?.ip())
}
