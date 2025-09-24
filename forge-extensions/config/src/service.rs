use anyhow::Result;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::types::{ForgeProjectSettings, ProjectConfig};

pub struct ForgeConfigService {
    pool: SqlitePool,
}

impl ForgeConfigService {
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
}

// Helper struct for database queries
#[derive(Debug, sqlx::FromRow)]
struct ProjectConfigRow {
    project_id: Uuid,
    custom_executors: Option<String>,
    forge_config: Option<String>,
}
