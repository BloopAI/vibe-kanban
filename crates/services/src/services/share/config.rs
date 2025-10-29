use url::Url;
use utils::ws::derive_ws_url;
use uuid::Uuid;

const DEFAULT_ACTIVITY_LIMIT: u32 = 200;
const DEFAULT_BULK_SYNC_THRESHOLD: u32 = 500;

#[derive(Clone)]
pub struct ShareConfig {
    pub api_base: Url,
    pub websocket_base: Url,
    pub activity_page_limit: u32,
    pub bulk_sync_threshold: u32,
}

impl ShareConfig {
    pub fn from_env() -> Option<Self> {
        let raw_base = std::env::var("VK_SHARED_API_BASE").ok()?;
        let api_base = Url::parse(raw_base.trim()).ok()?;
        let websocket_base = derive_ws_url(api_base.clone()).ok()?;

        Some(Self {
            api_base,
            websocket_base,
            activity_page_limit: DEFAULT_ACTIVITY_LIMIT,
            bulk_sync_threshold: DEFAULT_BULK_SYNC_THRESHOLD,
        })
    }

    pub fn activity_endpoint(&self) -> Result<Url, url::ParseError> {
        self.api_base.join("/v1/activity")
    }

    pub fn create_task_endpoint(&self) -> Result<Url, url::ParseError> {
        self.api_base.join("/v1/tasks")
    }

    pub fn bulk_tasks_endpoint(&self) -> Result<Url, url::ParseError> {
        self.api_base.join("/v1/tasks/bulk")
    }

    pub fn update_task_endpoint(&self, task_id: Uuid) -> Result<Url, url::ParseError> {
        self.api_base.join(&format!("/v1/tasks/{task_id}"))
    }

    pub fn delete_task_endpoint(&self, task_id: Uuid) -> Result<Url, url::ParseError> {
        self.api_base.join(&format!("/v1/tasks/{task_id}"))
    }

    pub fn assign_endpoint(&self, task_id: Uuid) -> Result<Url, url::ParseError> {
        self.api_base.join(&format!("/v1/tasks/{task_id}/assign"))
    }

    pub fn websocket_endpoint(&self, cursor: Option<i64>) -> Result<Url, url::ParseError> {
        let mut url = self.websocket_base.join("/v1/ws")?;
        if let Some(c) = cursor {
            url.query_pairs_mut().append_pair("cursor", &c.to_string());
        }
        Ok(url)
    }
}
