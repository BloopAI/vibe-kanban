use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum WebhookError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Webhook not found")]
    NotFound,
}

/// An outbound webhook registration — VK POSTs events here
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Webhook {
    pub id: Uuid,
    pub url: String,
    pub secret: Option<String>,
    pub description: Option<String>,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateWebhook {
    pub url: String,
    pub secret: Option<String>,
    pub description: Option<String>,
}

impl Webhook {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Webhook,
            r#"SELECT id AS "id!: Uuid",
                      url,
                      secret,
                      description,
                      enabled AS "enabled!: bool",
                      created_at AS "created_at!: DateTime<Utc>",
                      updated_at AS "updated_at!: DateTime<Utc>"
               FROM webhooks
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_enabled(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Webhook,
            r#"SELECT id AS "id!: Uuid",
                      url,
                      secret,
                      description,
                      enabled AS "enabled!: bool",
                      created_at AS "created_at!: DateTime<Utc>",
                      updated_at AS "updated_at!: DateTime<Utc>"
               FROM webhooks
               WHERE enabled = 1
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateWebhook,
    ) -> Result<Self, WebhookError> {
        let id = Uuid::new_v4();
        Ok(sqlx::query_as!(
            Webhook,
            r#"INSERT INTO webhooks (id, url, secret, description)
               VALUES ($1, $2, $3, $4)
               RETURNING id AS "id!: Uuid",
                         url,
                         secret,
                         description,
                         enabled AS "enabled!: bool",
                         created_at AS "created_at!: DateTime<Utc>",
                         updated_at AS "updated_at!: DateTime<Utc>""#,
            id,
            data.url,
            data.secret,
            data.description,
        )
        .fetch_one(pool)
        .await?)
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), WebhookError> {
        let rows = sqlx::query!("DELETE FROM webhooks WHERE id = $1", id)
            .execute(pool)
            .await?
            .rows_affected();
        if rows == 0 {
            Err(WebhookError::NotFound)
        } else {
            Ok(())
        }
    }
}
