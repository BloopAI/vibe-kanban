use url::Url;
use utils::ws::{WS_BULK_SYNC_THRESHOLD, derive_ws_url};
use uuid::Uuid;

const DEFAULT_ACTIVITY_LIMIT: u32 = 200;

#[derive(Clone)]
pub struct ShareConfig {
    pub api_base: Url,
    pub websocket_base: Url,
    pub activity_page_limit: u32,
    pub bulk_sync_threshold: u32,
}

impl ShareConfig {
    pub fn from_env() -> Option<Self> {
        let raw_base = std::env::var("VK_SHARED_API_BASE")
            .ok()
            .or_else(|| option_env!("VK_SHARED_API_BASE").map(|s| s.to_string()))?;
        let api_base = Url::parse(raw_base.trim()).ok()?;
        let websocket_base = derive_ws_url(api_base.clone()).ok()?;

        Some(Self {
            api_base,
            websocket_base,
            activity_page_limit: DEFAULT_ACTIVITY_LIMIT,
            bulk_sync_threshold: WS_BULK_SYNC_THRESHOLD,
        })
    }

    pub fn activity_endpoint(&self) -> Result<Url, url::ParseError> {
        self.api_base.join("/v1/activity")
    }

    pub fn bulk_tasks_endpoint(&self) -> Result<Url, url::ParseError> {
        self.api_base.join("/v1/tasks/bulk")
    }

    pub fn websocket_endpoint(
        &self,
        project_id: Uuid,
        cursor: Option<i64>,
    ) -> Result<Url, url::ParseError> {
        let mut url = self.websocket_base.join("/v1/ws")?;
        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("project_id", &project_id.to_string());
            if let Some(c) = cursor {
                qp.append_pair("cursor", &c.to_string());
            }
        }
        Ok(url)
    }
}
