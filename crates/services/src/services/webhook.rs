use std::{collections::HashMap, net::IpAddr, sync::Arc, time::Duration};

use chrono::{DateTime, Utc};
use db::{
    models::{
        execution_process::ExecutionProcess,
        label::Label,
        merge::Merge,
        project::Project,
        webhook::{Webhook, WebhookEventType},
    },
};
use sqlx::SqlitePool;
use tokio::sync::Semaphore;
use tracing::warn;
use utils::approvals::Question;
use uuid::Uuid;

/// Cap concurrent outbound webhook dispatches to avoid resource exhaustion.
static DISPATCH_SEM: std::sync::LazyLock<Arc<Semaphore>> =
    std::sync::LazyLock::new(|| Arc::new(Semaphore::new(20)));

/// Hop-by-hop and virtual-host headers that must not be forwarded.
const RESERVED_HEADERS: &[&str] = &[
    "host",
    "content-type",
    "transfer-encoding",
    "content-length",
    "connection",
    "keep-alive",
    "proxy-authorization",
    "te",
    "trailer",
    "upgrade",
];

#[derive(Clone)]
pub struct WebhookContext {
    pub project_id: Uuid,
    pub project_name: String,
    pub project_git_repo_path: String,
    pub project_github_owner: Option<String>,
    pub project_github_repo: Option<String>,
    pub task_id: Uuid,
    pub task_title: String,
    pub task_description: Option<String>,
    pub task_status: String,
    pub task_labels: Vec<String>,
    pub task_attempt_id: Uuid,
    pub task_attempt_executor: String,
    pub task_attempt_branch: String,
    pub task_attempt_worktree_path: Option<String>,
    pub execution_process_id: Uuid,
    pub execution_process_run_reason: String,
    pub event: WebhookEventPayload,
}

#[derive(Clone)]
pub enum WebhookEventPayload {
    ApprovalRequest {
        approval_id: String,
        tool_name: String,
        tool_input: serde_json::Value,
        timeout_at: Option<DateTime<Utc>>,
    },
    PendingQuestion {
        question_id: String,
        questions: Vec<Question>,
        timeout_at: Option<DateTime<Utc>>,
    },
    ExecutorFinish {
        status: String,
        completion_reason: Option<String>,
        exit_code: Option<i64>,
        started_at: DateTime<Utc>,
        completed_at: Option<DateTime<Utc>>,
        duration_ms: Option<i64>,
        pr_url: Option<String>,
        pr_number: Option<i64>,
    },
}

impl WebhookEventPayload {
    pub fn event_type(&self) -> WebhookEventType {
        match self {
            Self::ApprovalRequest { .. } => WebhookEventType::ApprovalRequest,
            Self::PendingQuestion { .. } => WebhookEventType::PendingQuestion,
            Self::ExecutorFinish { .. } => WebhookEventType::ExecutorFinish,
        }
    }
}

pub struct WebhookService;

impl WebhookService {
    pub async fn fire(pool: &SqlitePool, project_id: Uuid, ctx: WebhookContext) {
        let event_type = ctx.event.event_type();
        let webhooks = match Webhook::find_applicable(pool, project_id, &event_type).await {
            Ok(w) => w,
            Err(e) => {
                warn!(error = ?e, "Failed to load webhooks for firing");
                return;
            }
        };
        for webhook in webhooks {
            let ctx2 = ctx.clone();
            let sem = Arc::clone(&DISPATCH_SEM);
            // Step 4 (H5): acquire semaphore BEFORE spawning to bound concurrent dispatches.
            match sem.try_acquire_owned() {
                Ok(permit) => {
                    tokio::spawn(async move {
                        Self::dispatch(&webhook, &ctx2).await;
                        drop(permit);
                    });
                }
                Err(_) => {
                    warn!(webhook_id = %webhook.id, "Dispatch semaphore full, dropping webhook delivery");
                }
            }
        }
    }

    async fn dispatch(webhook: &Webhook, ctx: &WebhookContext) {
        // Capture timestamp once for consistent headers and payload
        let now = Utc::now();
        let ts = now.timestamp().to_string();

        // Step 1 (C1): resolve_pinned prevents DNS rebind TOCTOU.
        let parsed_url = match url::Url::parse(&webhook.url) {
            Ok(u) => u,
            Err(e) => {
                warn!(webhook_id = %webhook.id, error = ?e, "Webhook URL is invalid, skipping dispatch");
                return;
            }
        };
        let host = match parsed_url.host_str() {
            Some(h) => h.to_string(),
            None => {
                warn!(webhook_id = %webhook.id, "Webhook URL has no host, skipping dispatch");
                return;
            }
        };
        let resolved_addr = match Self::resolve_pinned(&webhook.url).await {
            Ok(addr) => addr,
            Err(e) => {
                warn!(webhook_id = %webhook.id, url = %webhook.url, error = %e, "Webhook URL SSRF check failed, skipping dispatch");
                return;
            }
        };

        let payload = Self::build_payload(webhook, ctx, now);
        let body = match serde_json::to_string(&payload) {
            Ok(b) => b,
            Err(e) => {
                warn!(webhook_id = %webhook.id, error = ?e, "Failed to serialize webhook payload");
                return;
            }
        };

        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::none()) // C1: prevent SSRF via redirect
            .resolve_to_addrs(&host, &[resolved_addr])   // C1: pin to verified address
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                warn!(error = ?e, "Failed to build reqwest client");
                return;
            }
        };

        let event_type = ctx.event.event_type();
        let mut builder = client.post(&webhook.url);

        // Apply user headers first, filtering reserved names (H3 + H6 expanded blocklist)
        for (k, v) in webhook.parse_headers() {
            let name_lower = k.to_lowercase();
            if name_lower.starts_with("x-vkswarm-")
                || RESERVED_HEADERS.contains(&name_lower.as_str())
            {
                warn!(
                    webhook_id = %webhook.id,
                    header = %k,
                    "Skipping reserved header name in user-configured headers"
                );
                continue;
            }
            // Step 5 (H5): defensive header application — skip malformed bytes
            match (
                axum::http::HeaderName::from_bytes(k.as_bytes()),
                axum::http::HeaderValue::from_str(&v),
            ) {
                (Ok(name), Ok(value)) => builder = builder.header(name, value),
                _ => warn!(webhook_id = %webhook.id, header = %k, "Skipping malformed stored header"),
            }
        }

        // Apply our headers after user headers so they cannot be overridden
        builder = builder
            .header("Content-Type", "application/json")
            .header("X-VkSwarm-Event", event_type.as_str())
            .header("X-VkSwarm-Timestamp", &ts);

        // H7: sign "timestamp.body" so receivers can validate freshness
        if let Some(secret) = &webhook.secret {
            let sig_input = format!("{ts}.{body}");
            let sig = Self::make_signature(secret, &sig_input);
            builder = builder.header("X-VkSwarm-Signature", format!("sha256={sig}"));
        }

        match builder.body(body).send().await {
            Err(e) => {
                warn!(
                    webhook_id = %webhook.id,
                    url = %webhook.url,
                    error = ?e,
                    "Webhook dispatch transport error"
                );
            }
            Ok(resp) => {
                if !resp.status().is_success() {
                    warn!(
                        webhook_id = %webhook.id,
                        url = %webhook.url,
                        status = %resp.status(),
                        "Webhook dispatch received non-2xx response"
                    );
                }
            }
        }
    }

    /// Compute an HMAC-SHA256 hex signature. Input should be "{timestamp}.{body}".
    pub fn make_signature(secret: &str, input: &str) -> String {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
            .expect("HMAC accepts any key length");
        mac.update(input.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    fn build_payload(
        webhook: &Webhook,
        ctx: &WebhookContext,
        now: DateTime<Utc>,
    ) -> serde_json::Value {
        match &webhook.payload_template {
            None => Self::default_json_payload(ctx, now),
            Some(template) => match serde_json::from_str::<serde_json::Value>(template) {
                Ok(mut val) => {
                    let vars = Self::build_variable_map(ctx, now);
                    Self::substitute_vars(&mut val, &vars);
                    val
                }
                Err(e) => {
                    warn!(
                        webhook_id = %webhook.id,
                        error = ?e,
                        "Webhook payload template is not valid JSON, using default payload"
                    );
                    Self::default_json_payload(ctx, now)
                }
            },
        }
    }

    /// Walk a JSON Value tree and replace `"{{var}}"` string nodes with typed values.
    fn substitute_vars(val: &mut serde_json::Value, vars: &HashMap<String, serde_json::Value>) {
        match val {
            serde_json::Value::String(s) => {
                // Full-field replacement: entire string is "{{var}}" → substitute typed value
                if let Some(key) = s.strip_prefix("{{").and_then(|s| s.strip_suffix("}}")) {
                    if let Some(replacement) = vars.get(key) {
                        *val = replacement.clone();
                        return;
                    }
                }
                // Inline substitution: replace {{var}} occurrences within a longer string
                let mut result = s.clone();
                for (k, v) in vars {
                    let placeholder = format!("{{{{{k}}}}}");
                    if result.contains(&placeholder) {
                        let str_val = match v {
                            serde_json::Value::String(sv) => sv.clone(),
                            serde_json::Value::Null => String::new(),
                            other => other.to_string(),
                        };
                        result = result.replace(&placeholder, &str_val);
                    }
                }
                *s = result;
            }
            serde_json::Value::Array(arr) => {
                arr.iter_mut().for_each(|v| Self::substitute_vars(v, vars));
            }
            serde_json::Value::Object(map) => {
                map.values_mut().for_each(|v| Self::substitute_vars(v, vars));
            }
            _ => {}
        }
    }

    /// Build a flat map of typed JSON values for template substitution.
    /// Optional fields that are absent are represented as `Value::Null` (not empty string).
    fn build_variable_map(
        ctx: &WebhookContext,
        now: DateTime<Utc>,
    ) -> HashMap<String, serde_json::Value> {
        let mut map: HashMap<String, serde_json::Value> = HashMap::new();

        map.insert("project.id".into(), ctx.project_id.to_string().into());
        map.insert("project.name".into(), ctx.project_name.clone().into());
        map.insert(
            "project.git_repo_path".into(),
            ctx.project_git_repo_path.clone().into(),
        );
        map.insert(
            "project.github_owner".into(),
            opt_str(ctx.project_github_owner.clone()),
        );
        map.insert(
            "project.github_repo".into(),
            opt_str(ctx.project_github_repo.clone()),
        );
        map.insert("task.id".into(), ctx.task_id.to_string().into());
        map.insert("task.title".into(), ctx.task_title.clone().into());
        map.insert("task.description".into(), opt_str(ctx.task_description.clone()));
        map.insert("task.status".into(), ctx.task_status.clone().into());
        map.insert(
            "task.labels".into(),
            serde_json::Value::Array(
                ctx.task_labels
                    .iter()
                    .map(|l| serde_json::Value::String(l.clone()))
                    .collect(),
            ),
        );
        map.insert(
            "task_attempt.id".into(),
            ctx.task_attempt_id.to_string().into(),
        );
        map.insert(
            "task_attempt.executor".into(),
            ctx.task_attempt_executor.clone().into(),
        );
        map.insert(
            "task_attempt.branch".into(),
            ctx.task_attempt_branch.clone().into(),
        );
        map.insert(
            "task_attempt.worktree_path".into(),
            opt_str(ctx.task_attempt_worktree_path.clone()),
        );
        map.insert(
            "execution_process.id".into(),
            ctx.execution_process_id.to_string().into(),
        );
        map.insert(
            "execution_process.run_reason".into(),
            ctx.execution_process_run_reason.clone().into(),
        );
        map.insert(
            "event.type".into(),
            ctx.event.event_type().as_str().to_string().into(),
        );
        map.insert("event.timestamp".into(), now.to_rfc3339().into());

        match &ctx.event {
            WebhookEventPayload::ApprovalRequest {
                approval_id,
                tool_name,
                tool_input,
                timeout_at,
            } => {
                map.insert("approval.id".into(), approval_id.clone().into());
                map.insert("approval.tool_name".into(), tool_name.clone().into());
                map.insert("approval.tool_input_json".into(), tool_input.clone());
                map.insert(
                    "approval.timeout_at".into(),
                    timeout_at
                        .map(|t| serde_json::Value::String(t.to_rfc3339()))
                        .unwrap_or(serde_json::Value::Null),
                );
            }
            WebhookEventPayload::PendingQuestion {
                question_id,
                questions,
                timeout_at,
            } => {
                map.insert("question.id".into(), question_id.clone().into());
                map.insert(
                    "question.questions_json".into(),
                    serde_json::to_value(questions).unwrap_or(serde_json::Value::Null),
                );
                map.insert(
                    "question.timeout_at".into(),
                    timeout_at
                        .map(|t| serde_json::Value::String(t.to_rfc3339()))
                        .unwrap_or(serde_json::Value::Null),
                );
            }
            WebhookEventPayload::ExecutorFinish {
                status,
                completion_reason,
                exit_code,
                started_at,
                completed_at,
                duration_ms,
                pr_url,
                pr_number,
            } => {
                map.insert("finish.status".into(), status.clone().into());
                map.insert(
                    "finish.completion_reason".into(),
                    opt_str(completion_reason.clone()),
                );
                map.insert(
                    "finish.exit_code".into(),
                    exit_code
                        .map(|c| serde_json::Value::Number(c.into()))
                        .unwrap_or(serde_json::Value::Null),
                );
                map.insert("finish.started_at".into(), started_at.to_rfc3339().into());
                map.insert(
                    "finish.completed_at".into(),
                    completed_at
                        .map(|t| serde_json::Value::String(t.to_rfc3339()))
                        .unwrap_or(serde_json::Value::Null),
                );
                map.insert(
                    "finish.duration_ms".into(),
                    duration_ms
                        .map(|d| serde_json::Value::Number(d.into()))
                        .unwrap_or(serde_json::Value::Null),
                );
                map.insert("finish.pr_url".into(), opt_str(pr_url.clone()));
                map.insert(
                    "finish.pr_number".into(),
                    pr_number
                        .map(|n| serde_json::Value::Number(n.into()))
                        .unwrap_or(serde_json::Value::Null),
                );
            }
        }
        map
    }

    fn default_json_payload(ctx: &WebhookContext, now: DateTime<Utc>) -> serde_json::Value {
        let mut payload = serde_json::json!({
            "event": {
                "type": ctx.event.event_type().as_str(),
                "timestamp": now.to_rfc3339(),
            },
            "project": {
                "id": ctx.project_id.to_string(),
                "name": ctx.project_name,
                "git_repo_path": ctx.project_git_repo_path,
                "github_owner": ctx.project_github_owner,
                "github_repo": ctx.project_github_repo,
            },
            "task": {
                "id": ctx.task_id.to_string(),
                "title": ctx.task_title,
                "description": ctx.task_description,
                "status": ctx.task_status,
                "labels": ctx.task_labels,
            },
            "task_attempt": {
                "id": ctx.task_attempt_id.to_string(),
                "executor": ctx.task_attempt_executor,
                "branch": ctx.task_attempt_branch,
                "worktree_path": ctx.task_attempt_worktree_path,
            },
            "execution_process": {
                "id": ctx.execution_process_id.to_string(),
                "run_reason": ctx.execution_process_run_reason,
            },
        });

        match &ctx.event {
            WebhookEventPayload::ApprovalRequest {
                approval_id,
                tool_name,
                tool_input,
                timeout_at,
            } => {
                payload["approval"] = serde_json::json!({
                    "id": approval_id,
                    "tool_name": tool_name,
                    "tool_input": tool_input,
                    "timeout_at": timeout_at,
                });
            }
            WebhookEventPayload::PendingQuestion {
                question_id,
                questions,
                timeout_at,
            } => {
                payload["question"] = serde_json::json!({
                    "id": question_id,
                    "questions": questions,
                    "timeout_at": timeout_at,
                });
            }
            WebhookEventPayload::ExecutorFinish {
                status,
                completion_reason,
                exit_code,
                started_at,
                completed_at,
                duration_ms,
                pr_url,
                pr_number,
            } => {
                payload["finish"] = serde_json::json!({
                    "status": status,
                    "completion_reason": completion_reason,
                    "exit_code": exit_code,
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration_ms": duration_ms,
                    "pr_url": pr_url,
                    "pr_number": pr_number,
                });
            }
        }
        payload
    }

    /// Validate a webhook URL with full DNS resolution to block SSRF.
    /// Requires https:// unless VK_WEBHOOK_ALLOW_HTTP=1 is set.
    /// Error messages are generic to avoid information disclosure (M2).
    pub async fn validate_url_async(url: &str) -> Result<(), String> {
        let parsed = url::Url::parse(url).map_err(|_| "Invalid webhook URL.".to_string())?;

        let allow_http = std::env::var("VK_WEBHOOK_ALLOW_HTTP")
            .map(|v| v == "1" || v.to_lowercase() == "true")
            .unwrap_or(false);

        match parsed.scheme() {
            "https" => {}
            "http" if allow_http => {}
            "http" => {
                return Err(
                    "Webhook URL must use https://. Set VK_WEBHOOK_ALLOW_HTTP=1 to allow http."
                        .into(),
                );
            }
            _ => return Err("Webhook URL must use http or https scheme.".into()),
        }

        let host = parsed.host_str().ok_or("Webhook URL is not reachable or targets a restricted address.")?;
        let port = parsed.port_or_known_default().unwrap_or(443);

        let addrs: Vec<_> = tokio::net::lookup_host(format!("{host}:{port}"))
            .await
            .map_err(|e| {
                warn!(url = %url, error = ?e, "DNS resolution failed for webhook URL");
                "Webhook URL is not reachable or targets a restricted address.".to_string()
            })?
            .collect();

        for addr in &addrs {
            let ip = addr.ip();
            if ip.is_loopback() || ip.is_unspecified() || is_private_ip(ip) {
                warn!(url = %url, ip = %ip, "Webhook URL resolves to restricted address, rejecting");
                return Err("Webhook URL targets a restricted or private address. External URLs only.".into());
            }
        }
        Ok(())
    }

    /// Build a WebhookContext for an executor_finish event.
    pub async fn build_finish_context(
        pool: &SqlitePool,
        exec_id: Uuid,
        status: String,
        completion_reason: Option<String>,
        exit_code: Option<i64>,
    ) -> Option<WebhookContext> {
        let ctx = ExecutionProcess::load_context(pool, exec_id).await.ok()?;
        let labels = Label::find_by_task_id(pool, ctx.task.id)
            .await
            .unwrap_or_default();
        let label_names: Vec<String> = labels.into_iter().map(|l| l.name).collect();
        let project = Project::find_by_id(pool, ctx.task.project_id).await.ok()??;
        let started_at = ctx.execution_process.started_at;
        let completed_at = ctx.execution_process.completed_at;
        let duration_ms = completed_at.map(|c| (c - started_at).num_milliseconds());
        let (pr_url, pr_number) =
            match Merge::find_latest_by_task_attempt_id(pool, ctx.task_attempt.id).await {
                Ok(Some(Merge::Pr(pr))) => {
                    (Some(pr.pr_info.url.clone()), Some(pr.pr_info.number))
                }
                _ => (None, None),
            };
        // Step 8 (M6): use Serialize instead of Debug format for run_reason
        let run_reason = serde_json::to_value(&ctx.execution_process.run_reason)
            .ok()
            .and_then(|v| v.as_str().map(str::to_owned))
            .unwrap_or_else(|| format!("{:?}", ctx.execution_process.run_reason));
        Some(WebhookContext {
            project_id: project.id,
            project_name: project.name.clone(),
            project_git_repo_path: project.git_repo_path.to_string_lossy().to_string(),
            project_github_owner: project.github_owner.clone(),
            project_github_repo: project.github_repo.clone(),
            task_id: ctx.task.id,
            task_title: ctx.task.title.clone(),
            task_description: ctx.task.description.clone(),
            task_status: format!("{:?}", ctx.task.status),
            task_labels: label_names,
            task_attempt_id: ctx.task_attempt.id,
            task_attempt_executor: ctx.task_attempt.executor.clone(),
            task_attempt_branch: ctx.task_attempt.branch.clone(),
            task_attempt_worktree_path: ctx.task_attempt.container_ref.clone(),
            execution_process_id: exec_id,
            execution_process_run_reason: run_reason,
            event: WebhookEventPayload::ExecutorFinish {
                status,
                completion_reason,
                exit_code,
                started_at,
                completed_at,
                duration_ms,
                pr_url,
                pr_number,
            },
        })
    }

    /// Build a WebhookContext for approval/question events.
    pub async fn build_approval_context(
        pool: &SqlitePool,
        exec_id: Uuid,
        event: WebhookEventPayload,
    ) -> Option<WebhookContext> {
        let ctx = ExecutionProcess::load_context(pool, exec_id).await.ok()?;
        let labels = Label::find_by_task_id(pool, ctx.task.id)
            .await
            .unwrap_or_default();
        let label_names: Vec<String> = labels.into_iter().map(|l| l.name).collect();
        let project = Project::find_by_id(pool, ctx.task.project_id).await.ok()??;
        // Step 8 (M6): use Serialize instead of Debug format for run_reason
        let run_reason = serde_json::to_value(&ctx.execution_process.run_reason)
            .ok()
            .and_then(|v| v.as_str().map(str::to_owned))
            .unwrap_or_else(|| format!("{:?}", ctx.execution_process.run_reason));
        Some(WebhookContext {
            project_id: project.id,
            project_name: project.name.clone(),
            project_git_repo_path: project.git_repo_path.to_string_lossy().to_string(),
            project_github_owner: project.github_owner.clone(),
            project_github_repo: project.github_repo.clone(),
            task_id: ctx.task.id,
            task_title: ctx.task.title.clone(),
            task_description: ctx.task.description.clone(),
            task_status: format!("{:?}", ctx.task.status),
            task_labels: label_names,
            task_attempt_id: ctx.task_attempt.id,
            task_attempt_executor: ctx.task_attempt.executor.clone(),
            task_attempt_branch: ctx.task_attempt.branch.clone(),
            task_attempt_worktree_path: ctx.task_attempt.container_ref.clone(),
            execution_process_id: exec_id,
            execution_process_run_reason: run_reason,
            event,
        })
    }

    /// Resolve hostname once, verify all IPs are public, return a pinned SocketAddr.
    /// This prevents DNS rebind TOCTOU attacks (C1): the same resolved IP is used for
    /// the actual HTTP connection via `.resolve_to_addrs()`, preventing a DNS flip between
    /// validation and send. Exposed `pub` so route handlers can pin their reqwest clients too.
    pub async fn resolve_pinned(url: &str) -> Result<std::net::SocketAddr, String> {
        let parsed = url::Url::parse(url).map_err(|_| "Invalid webhook URL.".to_string())?;
        let host = parsed
            .host_str()
            .ok_or("Webhook URL is not reachable or targets a restricted address.")?;
        let port = parsed.port_or_known_default().unwrap_or(443);
        let addrs: Vec<_> = tokio::net::lookup_host(format!("{host}:{port}"))
            .await
            .map_err(|_| {
                "Webhook URL is not reachable or targets a restricted address.".to_string()
            })?
            .collect();
        if addrs.is_empty() {
            return Err("Webhook URL is not reachable or targets a restricted address.".into());
        }
        for addr in &addrs {
            let ip = addr.ip();
            if ip.is_loopback() || ip.is_unspecified() || is_private_ip(ip) {
                warn!(url = %url, ip = %ip, "Webhook URL resolves to restricted address, rejecting");
                return Err(
                    "Webhook URL targets a restricted or private address. External URLs only."
                        .into(),
                );
            }
        }
        Ok(addrs[0])
    }
}

/// Returns true if the IP is in a private, link-local, or any reserved range.
/// Step 2 (H6): expanded to cover CGNAT, benchmarking, Class E, IPv4-compat.
fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_multicast()
                || v4.is_unspecified()
                || v4.is_documentation()
                // CGNAT / shared address space: 100.64.0.0/10
                || (o[0] == 100 && (64..=127).contains(&o[1]))
                // Benchmarking: 198.18.0.0/15
                || (o[0] == 198 && (18..=19).contains(&o[1]))
                // Reserved/Class E: 240.0.0.0/4
                || o[0] >= 240
        }
        IpAddr::V6(v6) => {
            let s = v6.segments();
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                // ULA fc00::/7
                || (s[0] & 0xfe00) == 0xfc00
                // Link-local fe80::/10
                || (s[0] & 0xffc0) == 0xfe80
                // Documentation 2001:db8::/32
                || (s[0] == 0x2001 && s[1] == 0x0db8)
                // IPv4-mapped ::ffff:x.x.x.x covers ::ffff: addresses
                || v6.to_ipv4_mapped().map(|v4| is_private_ip(IpAddr::V4(v4))).unwrap_or(false)
                // IPv4-compatible ::x.x.x.x
                || v6.to_ipv4().map(|v4| is_private_ip(IpAddr::V4(v4))).unwrap_or(false)
        }
    }
}

/// Convert `Option<String>` to a JSON `Value::String` or `Value::Null`.
fn opt_str(v: Option<String>) -> serde_json::Value {
    v.map(serde_json::Value::String)
        .unwrap_or(serde_json::Value::Null)
}
