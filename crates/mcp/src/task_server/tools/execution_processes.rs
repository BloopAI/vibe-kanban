use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::Deserialize;
use uuid::Uuid;

use super::TaskServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpGetExecutionProcessRequest {
    #[schemars(description = "The execution process ID to retrieve")]
    execution_process_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpStopExecutionRequest {
    #[schemars(description = "The execution process ID to stop")]
    execution_process_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpRespondApprovalRequest {
    #[schemars(description = "The approval request ID to respond to")]
    approval_id: String,
    #[schemars(description = "The execution process ID that requested approval")]
    execution_process_id: Uuid,
    #[schemars(description = "Whether to approve or deny the tool call: 'approved' or 'denied'")]
    status: String,
    #[schemars(description = "Optional reason for denying (only used when status is 'denied')")]
    reason: Option<String>,
}

#[tool_router(router = execution_processes_tools_router, vis = "pub")]
impl TaskServer {
    #[tool(
        description = "Get an execution process by ID. Returns status (running/completed/failed/killed), exit code, timestamps, and executor action details. Use this to poll execution progress."
    )]
    async fn get_execution_process(
        &self,
        Parameters(McpGetExecutionProcessRequest {
            execution_process_id,
        }): Parameters<McpGetExecutionProcessRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!(
            "/api/execution-processes/{}",
            execution_process_id
        ));
        let process: serde_json::Value = match self.send_json(self.client.get(&url)).await {
            Ok(v) => v,
            Err(e) => return Ok(e),
        };

        TaskServer::success(&process)
    }

    #[tool(
        description = "Stop a running execution process immediately (emergency brake). Sets the process status to 'killed'. Use when an agent is stuck or going in the wrong direction."
    )]
    async fn stop_execution(
        &self,
        Parameters(McpStopExecutionRequest {
            execution_process_id,
        }): Parameters<McpStopExecutionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!(
            "/api/execution-processes/{}/stop",
            execution_process_id
        ));
        if let Err(e) = self.send_empty_json(self.client.post(&url)).await {
            return Ok(e);
        }

        TaskServer::success(&serde_json::json!({
            "success": true,
            "execution_process_id": execution_process_id.to_string(),
            "status": "killed"
        }))
    }

    #[tool(
        description = "Respond to a pending tool approval request from an agent. Approve or deny a tool call that the agent is waiting for permission to execute."
    )]
    async fn respond_approval(
        &self,
        Parameters(McpRespondApprovalRequest {
            approval_id,
            execution_process_id,
            status,
            reason,
        }): Parameters<McpRespondApprovalRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/approvals/{}/respond", approval_id));

        let status_value = match status.trim().to_ascii_lowercase().as_str() {
            "approved" | "approve" => serde_json::json!({"status": "approved"}),
            "denied" | "deny" => {
                let mut v = serde_json::json!({"status": "denied"});
                if let Some(r) = reason {
                    let trimmed = r.trim().to_string();
                    if !trimmed.is_empty() {
                        v["reason"] = serde_json::json!(trimmed);
                    }
                }
                v
            }
            other => {
                return Self::err(
                    format!("Invalid status '{}'. Use 'approved' or 'denied'.", other),
                    None::<String>,
                );
            }
        };

        let payload = serde_json::json!({
            "execution_process_id": execution_process_id,
            "status": status_value,
        });

        let outcome: serde_json::Value =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(v) => v,
                Err(e) => return Ok(e),
            };

        TaskServer::success(&outcome)
    }
}

#[cfg(test)]
mod tests {
    use rmcp::handler::server::tool::Parameters;
    use wiremock::{
        Mock, MockServer, ResponseTemplate,
        matchers::{body_partial_json, method, path},
    };

    use super::*;

    async fn setup() -> (MockServer, TaskServer) {
        let mock = MockServer::start().await;
        let uri = mock.uri();
        let server = TaskServer::new(&uri);
        (mock, server)
    }

    fn assert_success(result: Result<CallToolResult, ErrorData>) {
        let r = result.expect("tool should not return Err");
        assert!(
            !r.is_error.unwrap_or(false),
            "expected success, got error: {:?}",
            r.content
        );
    }

    fn assert_error(result: Result<CallToolResult, ErrorData>) {
        let r = result.expect("tool should not return Err");
        assert!(
            r.is_error.unwrap_or(false),
            "expected error result, got success: {:?}",
            r.content
        );
    }

    #[tokio::test]
    async fn get_execution_process_returns_details() {
        let (mock, server) = setup().await;
        let epid = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/execution-processes/{}", epid)))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": {
                    "id": epid,
                    "session_id": Uuid::new_v4(),
                    "status": "completed",
                    "run_reason": "codingagent",
                    "executor_action": {},
                    "exit_code": 0,
                    "dropped": false,
                    "started_at": "2025-01-01T00:00:00Z",
                    "completed_at": "2025-01-01T00:01:00Z",
                    "created_at": "2025-01-01T00:00:00Z",
                    "updated_at": "2025-01-01T00:01:00Z"
                }
            })))
            .mount(&mock)
            .await;

        let result = server
            .get_execution_process(Parameters(McpGetExecutionProcessRequest {
                execution_process_id: epid,
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn get_execution_process_handles_not_found() {
        let (mock, server) = setup().await;
        let epid = Uuid::new_v4();

        Mock::given(method("GET"))
            .and(path(format!("/api/execution-processes/{}", epid)))
            .respond_with(ResponseTemplate::new(404))
            .mount(&mock)
            .await;

        let result = server
            .get_execution_process(Parameters(McpGetExecutionProcessRequest {
                execution_process_id: epid,
            }))
            .await;

        assert_error(result);
    }

    #[tokio::test]
    async fn stop_execution_kills_process() {
        let (mock, server) = setup().await;
        let epid = Uuid::new_v4();

        Mock::given(method("POST"))
            .and(path(format!("/api/execution-processes/{}/stop", epid)))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true
            })))
            .mount(&mock)
            .await;

        let result = server
            .stop_execution(Parameters(McpStopExecutionRequest {
                execution_process_id: epid,
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn stop_execution_handles_not_found() {
        let (mock, server) = setup().await;
        let epid = Uuid::new_v4();

        Mock::given(method("POST"))
            .and(path(format!("/api/execution-processes/{}/stop", epid)))
            .respond_with(ResponseTemplate::new(404))
            .mount(&mock)
            .await;

        let result = server
            .stop_execution(Parameters(McpStopExecutionRequest {
                execution_process_id: epid,
            }))
            .await;

        assert_error(result);
    }

    #[tokio::test]
    async fn respond_approval_approved() {
        let (mock, server) = setup().await;
        let approval_id = Uuid::new_v4().to_string();
        let epid = Uuid::new_v4();

        Mock::given(method("POST"))
            .and(path(format!("/api/approvals/{}/respond", approval_id)))
            .and(body_partial_json(serde_json::json!({
                "status": { "status": "approved" }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": { "status": "approved" }
            })))
            .mount(&mock)
            .await;

        let result = server
            .respond_approval(Parameters(McpRespondApprovalRequest {
                approval_id,
                execution_process_id: epid,
                status: "approved".to_string(),
                reason: None,
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn respond_approval_denied_with_reason() {
        let (mock, server) = setup().await;
        let approval_id = Uuid::new_v4().to_string();
        let epid = Uuid::new_v4();

        Mock::given(method("POST"))
            .and(path(format!("/api/approvals/{}/respond", approval_id)))
            .and(body_partial_json(serde_json::json!({
                "status": { "status": "denied", "reason": "Too risky" }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "success": true,
                "data": { "status": "denied", "reason": "Too risky" }
            })))
            .mount(&mock)
            .await;

        let result = server
            .respond_approval(Parameters(McpRespondApprovalRequest {
                approval_id,
                execution_process_id: epid,
                status: "denied".to_string(),
                reason: Some("Too risky".to_string()),
            }))
            .await;

        assert_success(result);
    }

    #[tokio::test]
    async fn respond_approval_invalid_status() {
        let (_mock, server) = setup().await;

        let result = server
            .respond_approval(Parameters(McpRespondApprovalRequest {
                approval_id: "fake-id".to_string(),
                execution_process_id: Uuid::new_v4(),
                status: "maybe".to_string(),
                reason: None,
            }))
            .await;

        assert_error(result);
    }
}
