use anyhow::Result;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::types::{ForgeProjectSettings, ProjectConfig};
use forge_omni::OmniConfig;

pub struct ForgeConfigService {
    pool: SqlitePool,
}

impl ForgeConfigService {
    pub const GLOBAL_PROJECT_ID: Uuid = Uuid::nil();

    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get_project_config(&self, project_id: Uuid) -> Result<Option<ProjectConfig>> {
        let record: Option<ProjectConfigRow> = sqlx::query_as(
            r#"SELECT
                project_id,
                custom_executors,
                forge_config
               FROM forge_project_settings
               WHERE project_id = ?"#,
        )
        .bind(project_id)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = record {
            Ok(Some(ProjectConfig {
                project_id: row.project_id,
                custom_executors: row
                    .custom_executors
                    .and_then(|s| serde_json::from_str(&s).ok()),
                forge_config: row.forge_config.and_then(|s| serde_json::from_str(&s).ok()),
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn set_project_config(&self, config: &ProjectConfig) -> Result<()> {
        let custom_executors_json = config
            .custom_executors
            .as_ref()
            .map(|v| serde_json::to_string(v))
            .transpose()?;

        let forge_config_json = config
            .forge_config
            .as_ref()
            .map(|v| serde_json::to_string(v))
            .transpose()?;

        sqlx::query(
            "INSERT OR REPLACE INTO forge_project_settings (project_id, custom_executors, forge_config) VALUES (?, ?, ?)"
        )
        .bind(config.project_id)
        .bind(custom_executors_json)
        .bind(forge_config_json)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_forge_settings(&self, project_id: Uuid) -> Result<ForgeProjectSettings> {
        if let Some(config) = self.get_project_config(project_id).await? {
            if let Some(forge_config) = config.forge_config {
                if let Ok(settings) = serde_json::from_value::<ForgeProjectSettings>(forge_config) {
                    return Ok(settings);
                }
            }
        }

        Ok(ForgeProjectSettings::default())
    }

    pub async fn set_forge_settings(
        &self,
        project_id: Uuid,
        settings: &ForgeProjectSettings,
    ) -> Result<()> {
        let forge_config_value = serde_json::to_value(settings)?;

        // Get existing config or create new one
        let mut config = self
            .get_project_config(project_id)
            .await?
            .unwrap_or_else(|| ProjectConfig {
                project_id,
                custom_executors: None,
                forge_config: None,
            });

        config.forge_config = Some(forge_config_value);

        self.set_project_config(&config).await
    }

    pub async fn get_global_settings(&self) -> Result<ForgeProjectSettings> {
        self.get_forge_settings(Self::GLOBAL_PROJECT_ID).await
    }

    pub async fn set_global_settings(&self, settings: &ForgeProjectSettings) -> Result<()> {
        self.set_forge_settings(Self::GLOBAL_PROJECT_ID, settings)
            .await
    }

    pub async fn effective_omni_config(&self, project_id: Option<Uuid>) -> Result<OmniConfig> {
        let global_settings = self.get_global_settings().await?;
        let mut config = global_settings.omni_config.clone().unwrap_or_default();
        config.enabled = global_settings.omni_enabled;

        if let Some(project_id) = project_id {
            if let Some(project_config) = self.get_project_config(project_id).await? {
                if let Some(value) = project_config.forge_config.clone() {
                    if let Ok(project_settings) =
                        serde_json::from_value::<ForgeProjectSettings>(value)
                    {
                        let mut project_omni = project_settings
                            .omni_config
                            .unwrap_or_else(|| config.clone());
                        project_omni.enabled = project_settings.omni_enabled;
                        config = project_omni;
                    }
                }
            }
        }

        Ok(config)
    }
}

// Helper struct for database queries
#[derive(Debug, sqlx::FromRow)]
struct ProjectConfigRow {
    project_id: Uuid,
    custom_executors: Option<String>,
    forge_config: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use forge_omni::{OmniConfig, RecipientType};

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("failed to create in-memory sqlite pool");

        sqlx::query(
            r#"CREATE TABLE forge_project_settings (
                    project_id TEXT PRIMARY KEY,
                    custom_executors TEXT,
                    forge_config TEXT
                )"#,
        )
        .execute(&pool)
        .await
        .expect("failed to create forge_project_settings table for tests");

        pool
    }

    #[tokio::test]
    async fn round_trips_global_settings() {
        let pool = setup_pool().await;
        let service = ForgeConfigService::new(pool);

        // defaults
        let mut settings = service
            .get_global_settings()
            .await
            .expect("default settings should load");
        assert!(!settings.omni_enabled);
        assert!(settings.omni_config.is_none());

        settings.omni_enabled = true;
        settings.omni_config = Some(OmniConfig {
            enabled: true,
            host: Some("https://omni.test".into()),
            api_key: Some("secret".into()),
            instance: Some("forge".into()),
            recipient: Some("+14155552671".into()),
            recipient_type: Some(RecipientType::PhoneNumber),
        });

        service
            .set_global_settings(&settings)
            .await
            .expect("should persist global settings");

        let fetched = service
            .get_global_settings()
            .await
            .expect("should load stored global settings");

        assert!(fetched.omni_enabled);
        assert_eq!(
            fetched.omni_config.unwrap().instance.as_deref(),
            Some("forge")
        );
    }
}
