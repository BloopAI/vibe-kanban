//! Host and Origin checks for the local server.
//!
//! The local server has no authentication of its own, so these checks are
//! what stops web pages from driving it:
//!
//! - The `Host` header must name this machine (a loopback name, `*.localhost`
//!   or an IP literal) or a hostname the user allowed. This blocks DNS
//!   rebinding: after a rebind, the browser sends the attacker's domain as
//!   `Host`, and both `Host` and `Origin` are that domain.
//! - A request with an `Origin` must come from the same origin as the
//!   (already checked) `Host`, or from an origin in `VK_ALLOWED_ORIGINS`.

use std::{net::IpAddr, sync::OnceLock};

use axum::{
    body::Body,
    extract::Request,
    http::{HeaderValue, StatusCode, header, uri::Authority},
    response::Response,
};
use relay_client::RELAY_HEADER;
use url::Url;

/// Comma-separated hostnames, besides this machine's own names, that the
/// local server accepts in the `Host` header.
pub const ALLOWED_HOSTS_ENV: &str = "VK_ALLOWED_HOSTS";
/// Comma-separated origins that may call the local server cross-origin.
pub const ALLOWED_ORIGINS_ENV: &str = "VK_ALLOWED_ORIGINS";

#[derive(Clone, Debug, Eq, PartialEq)]
struct OriginKey {
    https: bool,
    host: String,
    port: u16,
}

impl OriginKey {
    fn from_origin(origin: &str) -> Option<Self> {
        let url = Url::parse(origin).ok()?;
        let https = match url.scheme() {
            "http" => false,
            "https" => true,
            _ => return None,
        };
        let host = normalize_host(url.host_str()?);
        let port = url.port_or_known_default()?;
        Some(Self { https, host, port })
    }

    fn from_host_header(host: &str, https: bool) -> Option<Self> {
        let authority: Authority = host.parse().ok()?;
        let host = normalize_host(authority.host());
        let port = authority.port_u16().unwrap_or_else(|| default_port(https));
        Some(Self { https, host, port })
    }
}

/// What the local server accepts, read once from the environment.
#[derive(Debug, Default)]
struct AccessPolicy {
    /// Hostnames allowed in `Host` on top of loopback names and IP literals.
    hosts: Vec<String>,
    /// Origins allowed on top of same-origin requests.
    origins: Vec<OriginKey>,
}

impl AccessPolicy {
    fn from_env() -> Self {
        let allowed_hosts = std::env::var(ALLOWED_HOSTS_ENV).ok();
        let allowed_origins = std::env::var(ALLOWED_ORIGINS_ENV).ok();
        let bind_host = std::env::var("HOST").ok();
        Self::from_values(
            allowed_hosts.as_deref(),
            allowed_origins.as_deref(),
            bind_host.as_deref(),
        )
    }

    /// `allowed_hosts` and `allowed_origins` are the comma-separated env var
    /// values; `bind_host` is the `HOST` the server binds to.
    ///
    /// Hosts of `VK_ALLOWED_ORIGINS` and a hostname given as `HOST` are
    /// allowed too, so setups that worked before the Host check still work.
    fn from_values(
        allowed_hosts: Option<&str>,
        allowed_origins: Option<&str>,
        bind_host: Option<&str>,
    ) -> Self {
        let origins: Vec<OriginKey> = split_list(allowed_origins)
            .filter_map(OriginKey::from_origin)
            .collect();

        let mut hosts: Vec<String> = split_list(allowed_hosts)
            .chain(bind_host.map(str::trim).filter(|host| !host.is_empty()))
            .filter_map(parse_host_entry)
            .collect();
        hosts.extend(
            split_list(allowed_origins)
                .filter_map(|origin| Url::parse(origin).ok())
                .filter_map(|url| url.host_str().map(normalize_host_name)),
        );
        hosts.sort();
        hosts.dedup();

        Self { hosts, origins }
    }

    fn allows_host(&self, host: &str) -> bool {
        let Ok(authority) = host.parse::<Authority>() else {
            return false;
        };
        let name = normalize_host_name(authority.host());
        is_local_host_name(&name) || self.hosts.contains(&name)
    }

    fn allows_origin(&self, origin: &OriginKey) -> bool {
        self.origins.contains(origin)
    }
}

fn policy() -> &'static AccessPolicy {
    static POLICY: OnceLock<AccessPolicy> = OnceLock::new();
    POLICY.get_or_init(AccessPolicy::from_env)
}

/// Rejects requests whose `Host` header is not this machine or an allowed
/// hostname. Applied to every request, including the frontend and WebSocket
/// upgrades.
#[allow(clippy::result_large_err)]
pub fn validate_host<B>(req: &mut Request<B>) -> Result<(), Response> {
    check_host(req, policy())
}

/// Checks `Host` (see [`validate_host`]), then `Origin`.
#[allow(clippy::result_large_err)]
pub fn validate_origin<B>(req: &mut Request<B>) -> Result<(), Response> {
    check_request(req, policy())
}

#[allow(clippy::result_large_err)]
fn check_host<B>(req: &Request<B>, policy: &AccessPolicy) -> Result<(), Response> {
    let host = match req.headers().get(header::HOST) {
        Some(value) => value.to_str().ok().map(str::trim),
        // Browsers always send `Host`, so a request without one is not a
        // rebinding attack. HTTP/2 carries it in the URI instead.
        None => match req.uri().authority() {
            Some(authority) => Some(authority.as_str()),
            None => return Ok(()),
        },
    };

    match host {
        Some(host) if policy.allows_host(host) => Ok(()),
        host => {
            let host = host.unwrap_or("<invalid>");
            tracing::warn!(
                host,
                "Rejected a request whose Host header is not allowed. If you open Vibe Kanban \
                 through this hostname, add it to {ALLOWED_HOSTS_ENV}."
            );
            Err(host_forbidden(host))
        }
    }
}

#[allow(clippy::result_large_err)]
fn check_request<B>(req: &Request<B>, policy: &AccessPolicy) -> Result<(), Response> {
    check_host(req, policy)?;

    // Relayed requests carry the remote client's Origin. They are checked by
    // `relay_request_guard` instead, which requires a signature from a paired
    // device. The relay tunnel rewrites their `Host` to the local address, so
    // they pass the Host check above like any local request.
    if is_relay_request(req) {
        return Ok(());
    }

    let Some(origin) = get_header(req, header::ORIGIN) else {
        return Ok(());
    };

    if origin.eq_ignore_ascii_case("null") {
        return Err(forbidden());
    }

    let Some(origin_key) = OriginKey::from_origin(origin) else {
        return Err(forbidden());
    };

    if policy.allows_origin(&origin_key) {
        return Ok(());
    }

    // Same origin. This is only safe because `Host` was checked above: after
    // DNS rebinding, `Origin` and `Host` are both the attacker's domain.
    if let Some(host_key) = get_header(req, header::HOST)
        .and_then(|host| OriginKey::from_host_header(host, origin_key.https))
        && host_key == origin_key
    {
        return Ok(());
    }

    Err(forbidden())
}

fn get_header<B>(req: &Request<B>, name: header::HeaderName) -> Option<&str> {
    req.headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
}

fn is_relay_request<B>(req: &Request<B>) -> bool {
    req.headers()
        .get(RELAY_HEADER)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.trim() == "1")
}

fn forbidden() -> Response {
    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .body(Body::empty())
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

fn host_forbidden(host: &str) -> Response {
    let message = format!(
        "Vibe Kanban refused this request because its Host header ({host}) is not an \
         allowed host. If you open Vibe Kanban through this hostname, add it to the \
         {ALLOWED_HOSTS_ENV} environment variable (comma-separated) and restart Vibe Kanban.\n"
    );
    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .header(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/plain; charset=utf-8"),
        )
        .body(Body::from(message))
        .unwrap_or_else(|_| forbidden())
}

/// This machine's own names: loopback names, `*.localhost` (the preview
/// proxy's `{port}.localhost`) and IP literals. None of them can be the
/// result of DNS rebinding, which needs a domain the attacker controls.
fn is_local_host_name(name: &str) -> bool {
    name == "localhost" || name.ends_with(".localhost") || name.parse::<IpAddr>().is_ok()
}

/// Lowercase, without IPv6 brackets or a trailing dot.
fn normalize_host_name(host: &str) -> String {
    host.trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim_end_matches('.')
        .to_ascii_lowercase()
}

/// An entry of `VK_ALLOWED_HOSTS` or `HOST`: a hostname, optionally with a
/// port (ignored) or written as a URL.
fn parse_host_entry(entry: &str) -> Option<String> {
    let name = if entry.contains("://") {
        Url::parse(entry).ok()?.host_str()?.to_string()
    } else {
        entry.parse::<Authority>().ok()?.host().to_string()
    };
    let name = normalize_host_name(&name);
    (!name.is_empty()).then_some(name)
}

fn split_list(value: Option<&str>) -> impl Iterator<Item = &str> {
    value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
}

fn normalize_host(host: &str) -> String {
    let trimmed = host.trim().trim_start_matches('[').trim_end_matches(']');
    let lower = trimmed.to_ascii_lowercase();
    if lower == "localhost" {
        return "localhost".to_string();
    }
    if let Ok(ip) = lower.parse::<IpAddr>() {
        if ip.is_loopback() {
            return "localhost".to_string();
        }
        return ip.to_string();
    }
    lower
}

fn default_port(https: bool) -> u16 {
    if https { 443 } else { 80 }
}

#[cfg(test)]
mod tests {
    use axum::http::{Request, header};

    use super::*;

    fn make_request(origin: Option<&str>, host: Option<&str>) -> Request<Body> {
        let mut builder = Request::builder().uri("/test").method("GET");
        if let Some(origin) = origin {
            builder = builder.header(header::ORIGIN, origin);
        }
        if let Some(host) = host {
            builder = builder.header(header::HOST, host);
        }
        builder.body(Body::empty()).unwrap()
    }

    fn default_policy() -> AccessPolicy {
        AccessPolicy::from_values(None, None, None)
    }

    #[allow(clippy::result_large_err)]
    fn check(origin: Option<&str>, host: Option<&str>) -> Result<(), Response> {
        check_request(&make_request(origin, host), &default_policy())
    }

    fn is_forbidden(result: Result<(), Response>) -> bool {
        matches!(result, Err(resp) if resp.status() == StatusCode::FORBIDDEN)
    }

    #[test]
    fn no_origin_header_allows_request() {
        assert!(check(None, Some("127.0.0.1:3000")).is_ok());
        assert!(check(None, Some("localhost:3000")).is_ok());
    }

    #[test]
    fn null_origin_is_forbidden() {
        for null in ["null", "NULL", "Null"] {
            assert!(is_forbidden(check(Some(null), Some("127.0.0.1:3000"))));
        }
    }

    #[test]
    fn dns_rebinding_is_forbidden() {
        // The reporter's reproduction: after a rebind, Host and Origin are both
        // the attacker's domain.
        let host = "attacker.evil.example:54321";
        assert!(is_forbidden(check(
            Some("http://attacker.evil.example:54321"),
            Some(host)
        )));
        // A missing Origin does not help: same-origin GETs and WebSocket
        // handshakes from the rebound page are rejected on Host alone.
        assert!(is_forbidden(check(None, Some(host))));

        let mut ws = Request::builder()
            .uri("/api/terminal/ws")
            .header(header::HOST, host)
            .header(header::ORIGIN, "http://attacker.evil.example:54321")
            .header(header::UPGRADE, "websocket")
            .header(header::CONNECTION, "upgrade")
            .body(Body::empty())
            .unwrap();
        assert!(is_forbidden(validate_origin(&mut ws)));
        assert!(is_forbidden(validate_host(&mut ws)));
    }

    #[tokio::test]
    async fn host_rejection_names_the_env_var() {
        let Err(response) = check(None, Some("attacker.evil.example")) else {
            panic!("expected rejection");
        };
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let body = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();
        assert!(body.contains(ALLOWED_HOSTS_ENV), "{body}");
    }

    #[test]
    fn relayed_requests_still_need_an_allowed_host() {
        // A rebound page can set `x-vk-relayed` itself.
        let mut req = make_request(
            Some("http://attacker.evil.example"),
            Some("attacker.evil.example"),
        );
        req.headers_mut()
            .insert(RELAY_HEADER, HeaderValue::from_static("1"));
        assert!(is_forbidden(check_request(&req, &default_policy())));

        // What the relay tunnel sends after rewriting Host: the remote web
        // app's Origin, checked by `relay_request_guard` instead.
        let mut req = make_request(Some("https://cloud.example.com"), Some("127.0.0.1:3000"));
        req.headers_mut()
            .insert(RELAY_HEADER, HeaderValue::from_static("1"));
        assert!(check_request(&req, &default_policy()).is_ok());
    }

    #[test]
    fn origin_equal_to_host_is_not_enough() {
        // This used to pass just because Origin matched Host.
        let cases = [
            ("http://example.com", "example.com"),
            ("https://example.com", "example.com"),
            ("http://example.com:8080", "example.com:8080"),
            ("http://EXAMPLE.COM", "example.com"),
        ];
        for (origin, host) in cases {
            assert!(is_forbidden(check(Some(origin), Some(host))), "{origin}");
        }
    }

    #[test]
    fn loopback_hosts_on_any_port_are_allowed() {
        for host in [
            "127.0.0.1",
            "127.0.0.1:3000",
            "localhost:54321",
            "LOCALHOST:1",
            "localhost.:3000",
            "[::1]",
            "[::1]:3000",
            "0.0.0.0:3000",
        ] {
            assert!(check(None, Some(host)).is_ok(), "{host}");
        }
    }

    #[test]
    fn invalid_hosts_are_forbidden() {
        for host in [
            "",
            "attacker.evil.example:PORT",
            "localhost.evil.example",
            "127.0.0.1.evil.example",
            "evil.example/localhost",
        ] {
            assert!(is_forbidden(check(None, Some(host))), "{host:?}");
        }

        let mut req = make_request(None, None);
        req.headers_mut().insert(
            header::HOST,
            HeaderValue::from_bytes(b"\xfflocalhost").unwrap(),
        );
        assert!(is_forbidden(check_request(&req, &default_policy())));
    }

    #[test]
    fn missing_host_is_allowed() {
        // Only non-browser clients can omit Host.
        assert!(check(None, None).is_ok());
    }

    #[test]
    fn same_origin_requests_from_local_callers_are_allowed() {
        let cases = [
            // Browser UI and VS Code webview.
            ("http://127.0.0.1:3000", "127.0.0.1:3000"),
            ("http://localhost:3000", "localhost:3000"),
            ("http://127.0.0.1:3000", "[::1]:3000"),
            ("http://[::1]:3000", "localhost:3000"),
            // Desktop app (`startup::ServerHandle::url`).
            ("http://localhost:49152", "localhost:49152"),
            // Preview proxy, local and relayed.
            ("http://5173.localhost:3009", "5173.localhost:3009"),
            (
                "http://5173--01234567-89ab-cdef-0123-456789abcdef.localhost:3009",
                "5173--01234567-89ab-cdef-0123-456789abcdef.localhost:3009",
            ),
            // LAN or Docker with `HOST=0.0.0.0`, opened by IP.
            ("http://192.168.1.20:8080", "192.168.1.20:8080"),
            ("http://[fd00::20]:8080", "[fd00::20]:8080"),
        ];
        for (origin, host) in cases {
            assert!(
                check(Some(origin), Some(host)).is_ok(),
                "{origin} vs {host}"
            );
        }
    }

    #[test]
    fn cross_origin_forbidden() {
        let cases = [
            ("http://unknown.com", "127.0.0.1:3000"),  // different host
            ("http://localhost:8080", "localhost:80"), // different port
            ("http://localhost:5173", "127.0.0.1:3000"), // another local app
            ("http://5173.localhost:3009", "127.0.0.1:3000"), // preview -> API
            ("ftp://localhost", "localhost"),          // non-http scheme
            ("not-a-valid-url", "localhost"),          // invalid URL
            ("http://localhost", ""),                  // missing host
        ];
        for (origin, host) in cases {
            let host_opt = if host.is_empty() { None } else { Some(host) };
            assert!(is_forbidden(check(Some(origin), host_opt)), "{origin}");
        }
    }

    #[test]
    fn allowed_hosts_env_var() {
        let policy = AccessPolicy::from_values(
            Some(" vk.lan , MyBox.local:8080,https://vk.tailnet.ts.net, ,"),
            None,
            None,
        );
        for host in [
            "vk.lan",
            "vk.lan:8080",
            "mybox.local:1234",
            "vk.tailnet.ts.net",
        ] {
            let req = make_request(Some(&format!("http://{host}")), Some(host));
            assert!(check_request(&req, &policy).is_ok(), "{host}");
        }
        let req = make_request(None, Some("other.lan"));
        assert!(is_forbidden(check_request(&req, &policy)));
        // An allowed Host does not allow other origins.
        let req = make_request(Some("http://other.lan"), Some("vk.lan"));
        assert!(is_forbidden(check_request(&req, &policy)));
    }

    #[test]
    fn allowed_origins_env_var_allows_their_hosts() {
        // A reverse proxy that keeps the browser's Host, configured as the
        // README describes.
        let policy = AccessPolicy::from_values(None, Some("https://vk.example.com"), None);
        let req = make_request(Some("https://vk.example.com"), Some("vk.example.com"));
        assert!(check_request(&req, &policy).is_ok());
        // A reverse proxy that rewrites Host to the upstream address.
        let req = make_request(Some("https://vk.example.com"), Some("127.0.0.1:3000"));
        assert!(check_request(&req, &policy).is_ok());

        // The Vite dev server proxies with `changeOrigin`, so Host is the
        // backend and Origin is the dev server (`pnpm run dev` sets
        // VK_ALLOWED_ORIGINS to it).
        let policy = AccessPolicy::from_values(None, Some("http://localhost:3000"), None);
        let req = make_request(Some("http://localhost:3000"), Some("localhost:3001"));
        assert!(check_request(&req, &policy).is_ok());
    }

    #[test]
    fn bind_hostname_is_allowed() {
        let policy = AccessPolicy::from_values(None, None, Some("mybox.lan"));
        let req = make_request(Some("http://mybox.lan:8080"), Some("mybox.lan:8080"));
        assert!(check_request(&req, &policy).is_ok());
        // An IP `HOST` adds nothing: IP literals are always allowed.
        let policy = AccessPolicy::from_values(None, None, Some("0.0.0.0"));
        let req = make_request(None, Some("evil.example"));
        assert!(is_forbidden(check_request(&req, &policy)));
    }

    #[test]
    fn loopback_addresses_normalized_and_equivalent() {
        // All loopback forms normalize to "localhost"
        assert_eq!(
            OriginKey::from_origin("http://localhost:3000")
                .unwrap()
                .host,
            "localhost"
        );
        assert_eq!(
            OriginKey::from_origin("http://127.0.0.1:3000")
                .unwrap()
                .host,
            "localhost"
        );
        assert_eq!(
            OriginKey::from_origin("http://[::1]:3000").unwrap().host,
            "localhost"
        );
    }

    #[test]
    fn default_ports_handled_correctly() {
        assert_eq!(
            OriginKey::from_origin("http://example.com").unwrap().port,
            80
        );
        assert_eq!(
            OriginKey::from_origin("https://example.com").unwrap().port,
            443
        );

        // Explicit default port matches implicit
        assert!(check(Some("http://192.168.1.20:80"), Some("192.168.1.20")).is_ok());
    }
}
