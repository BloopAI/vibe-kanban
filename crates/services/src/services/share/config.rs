use uuid::Uuid;

const DEFAULT_ACTIVITY_LIMIT: u32 = 200;

#[derive(Clone)]
pub struct RemoteSyncConfig {
    pub api_base: String,
    pub websocket_base: String,
    pub activity_page_limit: u32,
}

impl RemoteSyncConfig {
    pub fn from_env() -> Option<Self> {
        let api_base = std::env::var("VK_SHARED_API_BASE").ok()?.trim().to_string();

        let websocket_base = match std::env::var("VK_SHARED_WS_URL") {
            Ok(raw) => raw.trim().to_string(),
            Err(_) => {
                tracing::error!("VK_SHARED_WS_URL not set");
                return None;
            }
        };

        Some(Self {
            api_base,
            websocket_base,
            activity_page_limit: DEFAULT_ACTIVITY_LIMIT,
        })
    }

    pub fn activity_endpoint(&self) -> String {
        format!("{}/v1/activity", self.api_base.trim_end_matches('/'))
    }

    pub fn create_task_endpoint(&self) -> String {
        format!("{}/v1/tasks", self.api_base.trim_end_matches('/'))
    }

    pub fn update_task_endpoint(&self, task_id: Uuid) -> String {
        format!(
            "{}/v1/tasks/{}",
            self.api_base.trim_end_matches('/'),
            task_id
        )
    }

    pub fn transfer_assignment_endpoint(&self, task_id: Uuid) -> String {
        format!(
            "{}/v1/tasks/{}/assign",
            self.api_base.trim_end_matches('/'),
            task_id
        )
    }

    pub fn websocket_endpoint(&self, cursor: Option<i64>) -> String {
        let base = self.websocket_base.trim_end_matches('/');
        let path = if base.ends_with("/v1/ws") || base.contains("/v1/ws?") {
            base.to_string()
        } else {
            format!("{base}/v1/ws")
        };

        match cursor {
            Some(c) => format!("{path}?cursor={c}"),
            None => path,
        }
    }
}
