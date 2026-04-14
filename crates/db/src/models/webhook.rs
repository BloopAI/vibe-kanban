use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum WebhookEventType {
    ApprovalRequest,
    PendingQuestion,
    ExecutorFinish,
}

impl WebhookEventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ApprovalRequest => "approval_request",
            Self::PendingQuestion => "pending_question",
            Self::ExecutorFinish => "executor_finish",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, FromRow)]
pub struct Webhook {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub name: String,
    pub url: String,
    /// JSON-serialized Vec<WebhookEventType>
    pub events: String,
    /// JSON-serialized HashMap<String, String>
    pub headers: String,
    pub secret: Option<String>,
    pub payload_template: Option<String>,
    pub override_global: bool,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Returned to API clients — header values masked, secret replaced with bool
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WebhookResponse {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub name: String,
    pub url: String,
    pub events: Vec<WebhookEventType>,
    pub headers: HashMap<String, String>,
    pub secret_set: bool,
    pub payload_template: Option<String>,
    pub override_global: bool,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateWebhook {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub events: Vec<WebhookEventType>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub secret: Option<String>,
    pub payload_template: Option<String>,
    #[serde(default)]
    pub override_global: bool,
    #[serde(default = "default_active")]
    pub active: bool,
}

fn default_active() -> bool {
    true
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateWebhook {
    pub name: Option<String>,
    pub url: Option<String>,
    pub events: Option<Vec<WebhookEventType>>,
    pub headers: Option<HashMap<String, String>>,
    pub secret: Option<String>,
    /// If true, clears the signing secret (sets it to NULL).
    #[serde(default)]
    pub clear_secret: bool,
    pub payload_template: Option<String>,
    /// If true, clears the payload template (reverts to default JSON payload).
    #[serde(default)]
    pub clear_payload_template: bool,
    pub override_global: Option<bool>,
    pub active: Option<bool>,
}

impl Webhook {
    pub fn parse_events(&self) -> Vec<WebhookEventType> {
        serde_json::from_str(&self.events).unwrap_or_default()
    }

    pub fn parse_headers(&self) -> HashMap<String, String> {
        serde_json::from_str(&self.headers).unwrap_or_default()
    }

    pub fn into_response(self) -> WebhookResponse {
        let secret_set = self.secret.is_some();
        let events = self.parse_events();
        let mut headers = self.parse_headers();
        // Mask all header values
        for v in headers.values_mut() {
            *v = "***".to_string();
        }
        WebhookResponse {
            id: self.id,
            project_id: self.project_id,
            name: self.name,
            url: self.url,
            events,
            headers,
            secret_set,
            payload_template: self.payload_template,
            override_global: self.override_global,
            active: self.active,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }

    pub async fn find_global(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Webhook,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id: Uuid",
                name, url, events, headers, secret, payload_template,
                override_global as "override_global!: bool",
                active as "active!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM webhooks WHERE project_id IS NULL ORDER BY created_at ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_for_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Webhook,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id: Uuid",
                name, url, events, headers, secret, payload_template,
                override_global as "override_global!: bool",
                active as "active!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM webhooks WHERE project_id = $1 ORDER BY created_at ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Webhook,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id: Uuid",
                name, url, events, headers, secret, payload_template,
                override_global as "override_global!: bool",
                active as "active!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM webhooks WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find webhooks applicable for a project+event in a single atomic query.
    /// Project webhooks matching the event are always included if active.
    /// Global webhooks are included unless any matching project webhook has override_global=true.
    pub async fn find_applicable(
        pool: &SqlitePool,
        project_id: Uuid,
        event_type: &WebhookEventType,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let event_str = event_type.as_str();
        // Single CTE query to atomically resolve precedence without a two-query race
        sqlx::query_as::<_, Self>(
            r#"WITH matching_project AS (
                SELECT * FROM webhooks
                WHERE project_id = ? AND active = 1
                AND EXISTS (SELECT 1 FROM json_each(events) WHERE value = ?)
            ),
            any_override AS (
                SELECT 1 FROM matching_project WHERE override_global = 1
            ),
            matching_global AS (
                SELECT * FROM webhooks
                WHERE project_id IS NULL AND active = 1
                AND EXISTS (SELECT 1 FROM json_each(events) WHERE value = ?)
                AND NOT EXISTS (SELECT 1 FROM any_override)
            )
            SELECT * FROM matching_project
            UNION ALL
            SELECT * FROM matching_global
            ORDER BY created_at ASC"#,
        )
        .bind(project_id)
        .bind(event_str)
        .bind(event_str)
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        project_id: Option<Uuid>,
        data: &CreateWebhook,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let events = serde_json::to_string(&data.events).unwrap_or_else(|_| "[]".into());
        let headers = serde_json::to_string(&data.headers).unwrap_or_else(|_| "{}".into());
        sqlx::query_as!(
            Webhook,
            r#"INSERT INTO webhooks (id, project_id, name, url, events, headers, secret, payload_template, override_global, active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING
                id as "id!: Uuid",
                project_id as "project_id: Uuid",
                name, url, events, headers, secret, payload_template,
                override_global as "override_global!: bool",
                active as "active!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            project_id,
            data.name,
            data.url,
            events,
            headers,
            data.secret,
            data.payload_template,
            data.override_global,
            data.active
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateWebhook,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;
        let name = data.name.as_deref().unwrap_or(&existing.name).to_string();
        let url = data.url.as_deref().unwrap_or(&existing.url).to_string();
        let events = data
            .events
            .as_ref()
            .map(|e| serde_json::to_string(e).unwrap_or_else(|_| existing.events.clone()))
            .unwrap_or_else(|| existing.events.clone());
        let headers = data
            .headers
            .as_ref()
            .map(|h| serde_json::to_string(h).unwrap_or_else(|_| existing.headers.clone()))
            .unwrap_or_else(|| existing.headers.clone());
        let secret = if data.clear_secret {
            None
        } else if data.secret.is_some() {
            data.secret.clone()
        } else {
            existing.secret.clone()
        };
        let payload_template = if data.clear_payload_template {
            None
        } else if data.payload_template.is_some() {
            data.payload_template.clone()
        } else {
            existing.payload_template.clone()
        };
        let override_global = data.override_global.unwrap_or(existing.override_global);
        let active = data.active.unwrap_or(existing.active);
        sqlx::query_as!(
            Webhook,
            r#"UPDATE webhooks
            SET name=$2, url=$3, events=$4, headers=$5, secret=$6, payload_template=$7, override_global=$8, active=$9, updated_at=datetime('now','subsec')
            WHERE id=$1
            RETURNING
                id as "id!: Uuid",
                project_id as "project_id: Uuid",
                name, url, events, headers, secret, payload_template,
                override_global as "override_global!: bool",
                active as "active!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            url,
            events,
            headers,
            secret,
            payload_template,
            override_global,
            active
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let r = sqlx::query!("DELETE FROM webhooks WHERE id=$1", id)
            .execute(pool)
            .await?;
        Ok(r.rows_affected())
    }
}
