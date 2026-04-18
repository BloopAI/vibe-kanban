use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, put},
};
use db::models::template::{CreateTemplate, Template, UnifiedTemplate, UpdateTemplate};
use deployment::Deployment;
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_template_middleware};

/// A built-in system template
struct SystemTemplate {
    id: &'static str,
    name: &'static str,
    content: &'static str,
    description: &'static str,
}

/// Built-in templates that are always available
static SYSTEM_TEMPLATES: &[SystemTemplate] = &[
    SystemTemplate {
        id: "system-bug-report",
        name: "Bug Report",
        content: "## Bug Description\nDescribe the bug clearly and concisely.\n\n## Steps to Reproduce\n1. Go to '...'\n2. Click on '...'\n3. See error\n\n## Expected Behavior\nDescribe what you expected to happen.\n\n## Actual Behavior\nDescribe what actually happened.",
        description: "Structured bug report template",
    },
    SystemTemplate {
        id: "system-feature-request",
        name: "Feature Request",
        content: "## Feature Description\nDescribe the feature you'd like to see.\n\n## Problem Statement\nWhat problem does this feature solve?\n\n## Proposed Solution\nDescribe how you think this should work.\n\n## Alternatives Considered\nAre there other ways to solve this?",
        description: "Feature request template",
    },
    SystemTemplate {
        id: "system-code-review",
        name: "Code Review Checklist",
        content: "## Code Review Checklist\n\n### Functionality\n- [ ] Code works as expected\n- [ ] Edge cases are handled\n- [ ] Error handling is appropriate\n\n### Code Quality\n- [ ] Code is readable and well-organized\n- [ ] No unnecessary complexity\n- [ ] DRY principle followed\n\n### Testing\n- [ ] Tests are included\n- [ ] Tests cover key scenarios",
        description: "Code review checklist template",
    },
    SystemTemplate {
        id: "system-quick-task",
        name: "Quick Task",
        content: "## Goal\nWhat needs to be accomplished?\n\n## Acceptance Criteria\n- [ ] \n\n## Notes\n",
        description: "Simple task template",
    },
];

#[derive(Deserialize, TS)]
pub struct TemplateSearchParams {
    #[serde(default)]
    pub search: Option<String>,
}

#[derive(Deserialize)]
pub struct TemplateByNameParams {
    /// Task ID for swarm context (optional)
    pub task_id: Option<Uuid>,
}

pub async fn get_templates(
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<TemplateSearchParams>,
) -> Result<ResponseJson<ApiResponse<Vec<Template>>>, ApiError> {
    let mut templates = Template::find_all(&deployment.db().pool).await?;

    // Filter by search query if provided
    if let Some(search_query) = params.search {
        let search_lower = search_query.to_lowercase();
        templates.retain(|template| {
            template
                .template_name
                .to_lowercase()
                .contains(&search_lower)
        });
    }

    Ok(ResponseJson(ApiResponse::success(templates)))
}

/// GET /api/templates/all - Returns all templates from all sources
pub async fn get_all_templates(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<UnifiedTemplate>>>, ApiError> {
    let mut all_templates: Vec<UnifiedTemplate> = Vec::new();

    // 1. Add system templates
    for t in SYSTEM_TEMPLATES {
        all_templates.push(UnifiedTemplate {
            id: t.id.to_string(),
            name: t.name.to_string(),
            content: t.content.to_string(),
            description: Some(t.description.to_string()),
            source: "system".to_string(),
            created_at: None,
            updated_at: None,
        });
    }

    // 2. Add local templates
    let local_templates = Template::find_all(&deployment.db().pool).await?;
    for t in local_templates {
        all_templates.push(UnifiedTemplate {
            id: t.id.to_string(),
            name: t.template_name,
            content: t.content,
            description: None,
            source: "local".to_string(),
            created_at: Some(t.created_at),
            updated_at: Some(t.updated_at),
        });
    }

    // Sort alphabetically by name
    all_templates.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(ResponseJson(ApiResponse::success(all_templates)))
}

/// GET /api/templates/by-name/{name} - Get template by name
pub async fn get_template_by_name(
    Path(name): Path<String>,
    Query(_params): Query<TemplateByNameParams>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<UnifiedTemplate>>, ApiError> {
    let name_lower = name.to_lowercase();

    // 1. Check system templates first
    for t in SYSTEM_TEMPLATES {
        if t.name.to_lowercase() == name_lower || t.id == name {
            return Ok(ResponseJson(ApiResponse::success(UnifiedTemplate {
                id: t.id.to_string(),
                name: t.name.to_string(),
                content: t.content.to_string(),
                description: Some(t.description.to_string()),
                source: "system".to_string(),
                created_at: None,
                updated_at: None,
            })));
        }
    }

    // 2. Check swarm templates if connected
    // Note: Swarm template lookup disabled due to compilation issues with remote client API.
    // The actual implementation requires an organization_id parameter that's not readily available
    // in this context, and the response structure is not properly handled.

    // 3. Check local templates
    let local_templates = Template::find_all(&deployment.db().pool).await?;
    for t in local_templates {
        if t.template_name.to_lowercase() == name_lower {
            return Ok(ResponseJson(ApiResponse::success(UnifiedTemplate {
                id: t.id.to_string(),
                name: t.template_name,
                content: t.content,
                description: None,
                source: "local".to_string(),
                created_at: Some(t.created_at),
                updated_at: Some(t.updated_at),
            })));
        }
    }

    Err(ApiError::NotFound(format!("Template '{}' not found", name)))
}

pub async fn create_template(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTemplate>,
) -> Result<ResponseJson<ApiResponse<Template>>, ApiError> {
    let template = Template::create(&deployment.db().pool, &payload).await?;

    Ok(ResponseJson(ApiResponse::success(template)))
}

pub async fn update_template(
    Extension(template): Extension<Template>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTemplate>,
) -> Result<ResponseJson<ApiResponse<Template>>, ApiError> {
    let updated_template = Template::update(&deployment.db().pool, template.id, &payload).await?;

    Ok(ResponseJson(ApiResponse::success(updated_template)))
}

pub async fn delete_template(
    Extension(template): Extension<Template>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = Template::delete(&deployment.db().pool, template.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let template_router = Router::new()
        .route("/", put(update_template).delete(delete_template))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_template_middleware,
        ));

    let inner = Router::new()
        .route("/", get(get_templates).post(create_template))
        .route("/all", get(get_all_templates))
        .route("/by-name/{name}", get(get_template_by_name))
        .nest("/{template_id}", template_router);

    Router::new().nest("/templates", inner)
}
