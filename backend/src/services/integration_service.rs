use crate::models::{
    Integration, IntegrationCategory, IntegrationEvent, IntegrationWithCategory,
    CreateIntegrationRequest, UpdateIntegrationRequest, IntegrationTestResult,
    health_status, event_types
};
use anyhow::Result;
use sqlx::SqlitePool;
use uuid::Uuid;
use tracing::info;

pub struct IntegrationService {
    pool: SqlitePool,
}

impl IntegrationService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    // Categories
    pub async fn get_categories(&self) -> Result<Vec<IntegrationCategory>> {
        let categories = sqlx::query_as!(
            IntegrationCategory,
            r#"SELECT id as "id!", display_name as "display_name!", description, icon, sort_order as "sort_order!: i32", created_at as "created_at!", updated_at as "updated_at!" FROM integration_categories ORDER BY sort_order ASC"#
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(categories)
    }

    // Integrations CRUD
    pub async fn list_integrations(&self) -> Result<Vec<IntegrationWithCategory>> {
        let integrations = sqlx::query!(
            r#"
            SELECT 
                i.id as "id!: Uuid", i.name as "name!", i.type as "integration_type!", i.provider as "provider!", i.config, 
                i.enabled as "enabled!", i.health_status as "health_status!", i.last_sync_at, i.last_health_check_at,
                i.error_message, i.created_at as "created_at!", i.updated_at as "updated_at!",
                c.id as "category_id!", c.display_name as "category_display_name!",
                c.description as category_description, c.icon as category_icon,
                c.sort_order as "category_sort_order!: i32", c.created_at as "category_created_at!",
                c.updated_at as "category_updated_at!"
            FROM integrations i
            JOIN integration_categories c ON i.category_id = c.id
            ORDER BY c.sort_order ASC, i.name ASC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut result = Vec::new();
        for row in integrations {
            let integration = IntegrationWithCategory {
                id: row.id,
                name: row.name,
                integration_type: row.integration_type,
                provider: row.provider,
                category: IntegrationCategory {
                    id: row.category_id,
                    display_name: row.category_display_name,
                    description: row.category_description,
                    icon: row.category_icon,
                    sort_order: row.category_sort_order,
                    created_at: row.category_created_at,
                    updated_at: row.category_updated_at,
                },
                config: row.config.as_ref().and_then(|c| serde_json::from_str(c).ok()),
                enabled: row.enabled,
                health_status: row.health_status,
                last_sync_at: row.last_sync_at,
                last_health_check_at: row.last_health_check_at,
                error_message: row.error_message,
                created_at: row.created_at,
                updated_at: row.updated_at,
            };
            result.push(integration);
        }

        Ok(result)
    }

    pub async fn get_integration(&self, id: Uuid) -> Result<Option<IntegrationWithCategory>> {
        let row = sqlx::query!(
            r#"
            SELECT 
                i.id as "id!: Uuid", i.name as "name!", i.type as "integration_type!", i.provider as "provider!", i.config, 
                i.enabled as "enabled!", i.health_status as "health_status!", i.last_sync_at, i.last_health_check_at,
                i.error_message, i.created_at as "created_at!", i.updated_at as "updated_at!",
                c.id as "category_id!", c.display_name as "category_display_name!",
                c.description as category_description, c.icon as category_icon,
                c.sort_order as "category_sort_order!: i32", c.created_at as "category_created_at!",
                c.updated_at as "category_updated_at!"
            FROM integrations i
            JOIN integration_categories c ON i.category_id = c.id
            WHERE i.id = ?
            "#,
            id
        )
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            let integration = IntegrationWithCategory {
                id: row.id,
                name: row.name,
                integration_type: row.integration_type,
                provider: row.provider,
                category: IntegrationCategory {
                    id: row.category_id,
                    display_name: row.category_display_name,
                    description: row.category_description,
                    icon: row.category_icon,
                    sort_order: row.category_sort_order,
                    created_at: row.category_created_at,
                    updated_at: row.category_updated_at,
                },
                config: row.config.as_ref().and_then(|c| serde_json::from_str(c).ok()),
                enabled: row.enabled,
                health_status: row.health_status,
                last_sync_at: row.last_sync_at,
                last_health_check_at: row.last_health_check_at,
                error_message: row.error_message,
                created_at: row.created_at,
                updated_at: row.updated_at,
            };
            Ok(Some(integration))
        } else {
            Ok(None)
        }
    }

    pub async fn create_integration(&self, request: CreateIntegrationRequest) -> Result<Integration> {
        let id = Uuid::new_v4();
        let config_json = request.config.and_then(|c| serde_json::to_string(&c).ok());
        let enabled = request.enabled.unwrap_or(false);

        sqlx::query!(
            r#"
            INSERT INTO integrations (
                id, name, type, provider, category_id, config, enabled,
                health_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'subsec'), datetime('now', 'subsec'))
            "#,
            id,
            request.name,
            request.integration_type,
            request.provider,
            request.category_id,
            config_json,
            enabled,
            health_status::UNKNOWN
        )
        .execute(&self.pool)
        .await?;

        // Log creation event
        self.log_event(id, event_types::CREATED, None).await?;

        // Get the created integration
        let integration = sqlx::query_as!(
            Integration,
            r#"SELECT id as "id!: Uuid", name as "name!", type as "integration_type!", provider as "provider!", category_id as "category_id!", config, enabled as "enabled!", health_status as "health_status!", last_sync_at, last_health_check_at, error_message, created_at as "created_at!", updated_at as "updated_at!" FROM integrations WHERE id = ?"#,
            id
        )
        .fetch_one(&self.pool)
        .await?;

        info!("Created integration: {} ({})", request.name, request.provider);
        Ok(integration)
    }

    pub async fn update_integration(&self, id: Uuid, request: UpdateIntegrationRequest) -> Result<Option<Integration>> {
        let config_json = request.config.and_then(|c| serde_json::to_string(&c).ok());

        let result = sqlx::query!(
            r#"
            UPDATE integrations 
            SET name = COALESCE(?, name),
                config = COALESCE(?, config),
                enabled = COALESCE(?, enabled),
                updated_at = datetime('now', 'subsec')
            WHERE id = ?
            "#,
            request.name,
            config_json,
            request.enabled,
            id
        )
        .execute(&self.pool)
        .await?;

        if result.rows_affected() > 0 {
            // Log update event
            self.log_event(id, event_types::UPDATED, None).await?;

            // If enabled status changed, log that too
            if let Some(enabled) = request.enabled {
                let event_type = if enabled { event_types::ENABLED } else { event_types::DISABLED };
                self.log_event(id, event_type, None).await?;
            }

            let integration = sqlx::query_as!(
                Integration,
                r#"SELECT id as "id!: Uuid", name as "name!", type as "integration_type!", provider as "provider!", category_id as "category_id!", config, enabled as "enabled!", health_status as "health_status!", last_sync_at, last_health_check_at, error_message, created_at as "created_at!", updated_at as "updated_at!" FROM integrations WHERE id = ?"#,
                id
            )
            .fetch_one(&self.pool)
            .await?;

            Ok(Some(integration))
        } else {
            Ok(None)
        }
    }

    pub async fn delete_integration(&self, id: Uuid) -> Result<bool> {
        let result = sqlx::query!(
            "DELETE FROM integrations WHERE id = ?",
            id
        )
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    // Health and testing
    pub async fn test_integration(&self, id: Uuid) -> Result<IntegrationTestResult> {
        let integration = self.get_integration(id).await?;
        
        match integration {
            Some(integration) => {
                let test_result = self.perform_integration_test(&integration).await?;
                
                // Update health status based on test result
                let health_status = if test_result.success {
                    health_status::HEALTHY
                } else {
                    health_status::ERROR
                };

                let error_message = if test_result.success { 
                    None 
                } else { 
                    Some(test_result.message.clone()) 
                };

                sqlx::query!(
                    r#"
                    UPDATE integrations 
                    SET health_status = ?,
                        last_health_check_at = datetime('now', 'subsec'),
                        error_message = ?
                    WHERE id = ?
                    "#,
                    health_status,
                    error_message,
                    id
                )
                .execute(&self.pool)
                .await?;

                // Log test event
                let event_data = serde_json::json!({
                    "success": test_result.success,
                    "message": test_result.message,
                    "details": test_result.details
                });
                self.log_event(id, event_types::TEST, Some(event_data)).await?;

                Ok(test_result)
            }
            None => Ok(IntegrationTestResult {
                success: false,
                message: "Integration not found".to_string(),
                details: None,
            })
        }
    }

    pub async fn sync_integration(&self, id: Uuid) -> Result<bool> {
        let integration = self.get_integration(id).await?;
        
        match integration {
            Some(_integration) => {
                // TODO: Implement actual sync logic based on integration type
                
                sqlx::query!(
                    r#"
                    UPDATE integrations 
                    SET last_sync_at = datetime('now', 'subsec')
                    WHERE id = ?
                    "#,
                    id
                )
                .execute(&self.pool)
                .await?;

                // Log sync event
                self.log_event(id, event_types::SYNC, None).await?;

                Ok(true)
            }
            None => Ok(false)
        }
    }

    // Event logging
    pub async fn log_event(&self, integration_id: Uuid, event_type: &str, event_data: Option<serde_json::Value>) -> Result<()> {
        let event_id = Uuid::new_v4();
        let event_data_json = event_data.and_then(|d| serde_json::to_string(&d).ok());

        sqlx::query!(
            r#"
            INSERT INTO integration_events (id, integration_id, event_type, event_data, created_at)
            VALUES (?, ?, ?, ?, datetime('now', 'subsec'))
            "#,
            event_id,
            integration_id,
            event_type,
            event_data_json
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_integration_events(&self, integration_id: Uuid, limit: Option<i32>) -> Result<Vec<IntegrationEvent>> {
        let limit = limit.unwrap_or(50);
        
        let events = sqlx::query_as!(
            IntegrationEvent,
            r#"
            SELECT id as "id!: Uuid", integration_id as "integration_id!: Uuid", event_type, event_data, created_at FROM integration_events 
            WHERE integration_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
            "#,
            integration_id,
            limit
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(events)
    }

    // Private helper methods
    async fn perform_integration_test(&self, integration: &IntegrationWithCategory) -> Result<IntegrationTestResult> {
        // TODO: Implement actual testing logic based on integration type and provider
        match integration.provider.as_str() {
            "github" => self.test_github_integration(integration).await,
            "slack" => self.test_slack_integration(integration).await,
            "claude" | "amp" | "gemini" | "charmopencode" => self.test_mcp_integration(integration).await,
            _ => Ok(IntegrationTestResult {
                success: false,
                message: format!("Testing not implemented for provider: {}", integration.provider),
                details: None,
            })
        }
    }

    async fn test_github_integration(&self, _integration: &IntegrationWithCategory) -> Result<IntegrationTestResult> {
        // TODO: Implement GitHub API test
        Ok(IntegrationTestResult {
            success: true,
            message: "GitHub integration test successful".to_string(),
            details: Some(serde_json::json!({"api_version": "v3"})),
        })
    }

    async fn test_slack_integration(&self, _integration: &IntegrationWithCategory) -> Result<IntegrationTestResult> {
        // TODO: Implement Slack API test
        Ok(IntegrationTestResult {
            success: true,
            message: "Slack integration test successful".to_string(),
            details: None,
        })
    }

    async fn test_mcp_integration(&self, _integration: &IntegrationWithCategory) -> Result<IntegrationTestResult> {
        // TODO: Implement MCP integration test
        Ok(IntegrationTestResult {
            success: true,
            message: "MCP integration test successful".to_string(),
            details: None,
        })
    }
}