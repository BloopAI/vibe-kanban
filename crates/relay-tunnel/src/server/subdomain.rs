use url::Url;

/// Extract relay subdomain from host using URL parsing.
pub fn extract_relay_subdomain(host: &str, relay_base_domain: &str) -> Option<String> {
    let host_domain = Url::parse(&format!("http://{host}"))
        .ok()?
        .host_str()?
        .to_ascii_lowercase();
    let base_domain = Url::parse(&format!("http://{relay_base_domain}"))
        .ok()?
        .host_str()?
        .to_ascii_lowercase();

    let suffix = format!(".{base_domain}");
    let prefix = host_domain.strip_suffix(&suffix)?;
    if prefix.is_empty() {
        None
    } else {
        Some(prefix.to_string())
    }
}
