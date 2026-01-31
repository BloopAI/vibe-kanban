use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use ts_rs::TS;

/// Swarm configuration stored in database
/// Secrets (api keys, tokens) are NOT serialized to frontend
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SwarmConfig {
    pub id: String,

    // Daytona
    pub daytona_api_url: Option<String>,
    #[serde(skip_serializing)]
    pub daytona_api_key: Option<String>,

    // Pool
    pub pool_max_sandboxes: i32,
    pub pool_idle_timeout_minutes: i32,
    pub pool_default_snapshot: String,

    // Claude
    #[serde(skip_serializing)]
    pub anthropic_api_key: Option<String>,

    // Skills
    pub skills_path: String,

    // Git
    pub git_auto_commit: bool,
    pub git_auto_push: bool,
    #[serde(skip_serializing)]
    pub git_token: Option<String>,

    // Trigger Engine
    pub trigger_enabled: bool,
    pub trigger_poll_interval_seconds: i32,
    pub trigger_execution_timeout_minutes: i32,
    pub trigger_max_retries: i32,

    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// DTO for updating config (accepts secrets)
#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateSwarmConfig {
    // Daytona
    pub daytona_api_url: Option<String>,
    pub daytona_api_key: Option<String>,

    // Pool
    pub pool_max_sandboxes: Option<i32>,
    pub pool_idle_timeout_minutes: Option<i32>,
    pub pool_default_snapshot: Option<String>,

    // Claude
    pub anthropic_api_key: Option<String>,

    // Skills
    pub skills_path: Option<String>,

    // Git
    pub git_auto_commit: Option<bool>,
    pub git_auto_push: Option<bool>,
    pub git_token: Option<String>,

    // Trigger Engine
    pub trigger_enabled: Option<bool>,
    pub trigger_poll_interval_seconds: Option<i32>,
    pub trigger_execution_timeout_minutes: Option<i32>,
    pub trigger_max_retries: Option<i32>,
}

/// Response that includes masked secrets info for display
#[derive(Debug, Clone, Serialize, TS)]
pub struct SwarmConfigWithMaskedSecrets {
    #[serde(flatten)]
    #[ts(flatten)]
    pub config: SwarmConfig,
    pub has_daytona_api_key: bool,
    pub has_anthropic_api_key: bool,
    pub has_git_token: bool,
}

impl SwarmConfig {
    fn from_row(row: sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        let git_auto_commit: i32 = row.try_get("git_auto_commit").unwrap_or(1);
        let git_auto_push: i32 = row.try_get("git_auto_push").unwrap_or(0);
        let trigger_enabled: i32 = row.try_get("trigger_enabled").unwrap_or(1);

        Ok(Self {
            id: row.try_get::<Option<String>, _>("id")?.unwrap_or_else(|| "default".to_string()),
            daytona_api_url: row.try_get("daytona_api_url")?,
            daytona_api_key: row.try_get("daytona_api_key")?,
            pool_max_sandboxes: row.try_get::<Option<i32>, _>("pool_max_sandboxes")?.unwrap_or(5),
            pool_idle_timeout_minutes: row.try_get::<Option<i32>, _>("pool_idle_timeout_minutes")?.unwrap_or(10),
            pool_default_snapshot: row.try_get::<Option<String>, _>("pool_default_snapshot")?.unwrap_or_else(|| "swarm-lite-v1".to_string()),
            anthropic_api_key: row.try_get("anthropic_api_key")?,
            skills_path: row.try_get::<Option<String>, _>("skills_path")?.unwrap_or_else(|| "/root/.claude/skills".to_string()),
            git_auto_commit: git_auto_commit != 0,
            git_auto_push: git_auto_push != 0,
            git_token: row.try_get("git_token")?,
            trigger_enabled: trigger_enabled != 0,
            trigger_poll_interval_seconds: row.try_get::<Option<i32>, _>("trigger_poll_interval_seconds")?.unwrap_or(5),
            trigger_execution_timeout_minutes: row.try_get::<Option<i32>, _>("trigger_execution_timeout_minutes")?.unwrap_or(10),
            trigger_max_retries: row.try_get::<Option<i32>, _>("trigger_max_retries")?.unwrap_or(3),
            updated_at: row.try_get("updated_at")?,
        })
    }

    pub async fn get(pool: &SqlitePool) -> Result<Self, sqlx::Error> {
        let row = sqlx::query(
            "SELECT id, daytona_api_url, daytona_api_key, pool_max_sandboxes,
                    pool_idle_timeout_minutes, pool_default_snapshot, anthropic_api_key,
                    skills_path, git_auto_commit, git_auto_push, git_token, trigger_enabled,
                    trigger_poll_interval_seconds, trigger_execution_timeout_minutes,
                    trigger_max_retries, updated_at
             FROM swarm_config
             WHERE id = 'default'"
        )
        .fetch_one(pool)
        .await?;

        Self::from_row(row)
    }

    pub async fn update(pool: &SqlitePool, data: &UpdateSwarmConfig) -> Result<Self, sqlx::Error> {
        let existing = Self::get(pool).await?;

        let daytona_api_url = data.daytona_api_url.clone().or(existing.daytona_api_url);
        let daytona_api_key = data.daytona_api_key.clone().or(existing.daytona_api_key);
        let pool_max_sandboxes = data.pool_max_sandboxes.unwrap_or(existing.pool_max_sandboxes);
        let pool_idle_timeout_minutes = data.pool_idle_timeout_minutes.unwrap_or(existing.pool_idle_timeout_minutes);
        let pool_default_snapshot = data.pool_default_snapshot.clone().unwrap_or(existing.pool_default_snapshot);
        let anthropic_api_key = data.anthropic_api_key.clone().or(existing.anthropic_api_key);
        let skills_path = data.skills_path.clone().unwrap_or(existing.skills_path);
        let git_auto_commit = data.git_auto_commit.unwrap_or(existing.git_auto_commit);
        let git_auto_push = data.git_auto_push.unwrap_or(existing.git_auto_push);
        let git_token = data.git_token.clone().or(existing.git_token);
        let trigger_enabled = data.trigger_enabled.unwrap_or(existing.trigger_enabled);
        let trigger_poll_interval_seconds = data.trigger_poll_interval_seconds.unwrap_or(existing.trigger_poll_interval_seconds);
        let trigger_execution_timeout_minutes = data.trigger_execution_timeout_minutes.unwrap_or(existing.trigger_execution_timeout_minutes);
        let trigger_max_retries = data.trigger_max_retries.unwrap_or(existing.trigger_max_retries);

        // SQLite booleans
        let git_auto_commit_int: i32 = if git_auto_commit { 1 } else { 0 };
        let git_auto_push_int: i32 = if git_auto_push { 1 } else { 0 };
        let trigger_enabled_int: i32 = if trigger_enabled { 1 } else { 0 };

        sqlx::query(
            "UPDATE swarm_config SET
                daytona_api_url = $1,
                daytona_api_key = $2,
                pool_max_sandboxes = $3,
                pool_idle_timeout_minutes = $4,
                pool_default_snapshot = $5,
                anthropic_api_key = $6,
                skills_path = $7,
                git_auto_commit = $8,
                git_auto_push = $9,
                git_token = $10,
                trigger_enabled = $11,
                trigger_poll_interval_seconds = $12,
                trigger_execution_timeout_minutes = $13,
                trigger_max_retries = $14,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 'default'"
        )
        .bind(&daytona_api_url)
        .bind(&daytona_api_key)
        .bind(pool_max_sandboxes)
        .bind(pool_idle_timeout_minutes)
        .bind(&pool_default_snapshot)
        .bind(&anthropic_api_key)
        .bind(&skills_path)
        .bind(git_auto_commit_int)
        .bind(git_auto_push_int)
        .bind(&git_token)
        .bind(trigger_enabled_int)
        .bind(trigger_poll_interval_seconds)
        .bind(trigger_execution_timeout_minutes)
        .bind(trigger_max_retries)
        .execute(pool)
        .await?;

        Self::get(pool).await
    }

    /// Get config with masked secrets info (for frontend display)
    pub async fn get_with_masked_secrets(pool: &SqlitePool) -> Result<SwarmConfigWithMaskedSecrets, sqlx::Error> {
        let config = Self::get(pool).await?;

        Ok(SwarmConfigWithMaskedSecrets {
            has_daytona_api_key: config.daytona_api_key.is_some(),
            has_anthropic_api_key: config.anthropic_api_key.is_some(),
            has_git_token: config.git_token.is_some(),
            config,
        })
    }
}
