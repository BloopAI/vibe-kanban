use uuid::Uuid;

const DEFAULT_ACTIVITY_LIMIT: u32 = 200;

#[derive(Clone)]
pub struct RemoteSyncConfig {
    pub api_base: String,
    pub websocket_base: String,
    pub organization_id: Uuid,
    pub member_id: Uuid,
    pub activity_page_limit: u32,
}

impl RemoteSyncConfig {
    pub fn from_env() -> Option<Self> {
        let api_base = std::env::var("VK_SHARED_API_BASE").ok()?.trim().to_string();
        let org_raw = std::env::var("VK_SHARED_ORGANIZATION_ID").ok()?;
        let organization_id = Uuid::parse_str(org_raw.trim()).ok()?;

        let websocket_base = match std::env::var("VK_SHARED_WS_URL") {
            Ok(raw) => raw.trim().to_string(),
            Err(_) => {
                tracing::error!("VK_SHARED_WS_URL not set");
                return None;
            }
        };

        let member_raw = std::env::var("VK_SHARED_MEMBER_ID").ok()?;
        let member_id = Uuid::parse_str(member_raw.trim()).ok()?;

        Some(Self {
            api_base,
            websocket_base,
            organization_id,
            member_id,
            activity_page_limit: DEFAULT_ACTIVITY_LIMIT,
        })
    }

    pub fn activity_endpoint(&self) -> String {
        format!(
            "{}/v1/organizations/{}/activity",
            self.api_base.trim_end_matches('/'),
            self.organization_id
        )
    }

    pub fn create_task_endpoint(&self) -> String {
        format!(
            "{}/v1/organizations/{}/tasks",
            self.api_base.trim_end_matches('/'),
            self.organization_id
        )
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
            Some(c) => format!(
                "{}?organization_id={}&cursor={}",
                path, self.organization_id, c
            ),
            None => format!("{}?organization_id={}", path, self.organization_id),
        }
    }
}
