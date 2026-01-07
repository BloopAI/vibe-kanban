use url::Url;

#[derive(Clone)]
pub struct ShareConfig {
    pub api_base: Url,
}

impl ShareConfig {
    pub fn from_env() -> Option<Self> {
        let raw_base = std::env::var("VK_SHARED_API_BASE")
            .ok()
            .or_else(|| option_env!("VK_SHARED_API_BASE").map(|s| s.to_string()))?;
        let api_base = Url::parse(raw_base.trim()).ok()?;

        Some(Self { api_base })
    }
}
