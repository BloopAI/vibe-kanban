use axum::{
    routing::get,
    Router,
    Json,
    response::Json as ResponseJson,
    extract::{Path, Extension},
    http::StatusCode,
};
use sqlx::PgPool;
use uuid::Uuid;
use chrono::Utc;

use crate::models::{ApiResponse, project::{Project, CreateProject, UpdateProject}};
use crate::auth::AuthUser;

pub async fn get_projects(
    auth: AuthUser,
    Extension(pool): Extension<PgPool>
) -> Result<ResponseJson<ApiResponse<Vec<Project>>>, StatusCode> {
    match sqlx::query_as!(
        Project,
        "SELECT id, name, git_repo_path, owner_id, created_at, updated_at FROM projects ORDER BY created_at DESC"
    )
    .fetch_all(&pool)
    .await
    {
        Ok(projects) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(projects),
            message: None,
        })),
        Err(e) => {
            tracing::error!("Failed to fetch projects: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_project(
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Extension(pool): Extension<PgPool>
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    match sqlx::query_as!(
        Project,
        "SELECT id, name, git_repo_path, owner_id, created_at, updated_at FROM projects WHERE id = $1",
        id
    )
    .fetch_optional(&pool)
    .await
    {
        Ok(Some(project)) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(project),
            message: None,
        })),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to fetch project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn create_project(
    auth: AuthUser,
    Extension(pool): Extension<PgPool>,
    Json(payload): Json<CreateProject>
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    let id = Uuid::new_v4();
    let now = Utc::now();

    tracing::debug!("Creating project '{}' for user {}", payload.name, auth.user_id);

    // Validate and setup git repository
    let path = std::path::Path::new(&payload.git_repo_path);
    
    // Create directory if it doesn't exist
    if !path.exists() {
        if let Err(e) = std::fs::create_dir_all(path) {
            tracing::error!("Failed to create directory: {}", e);
            return Ok(ResponseJson(ApiResponse {
                success: false,
                data: None,
                message: Some(format!("Failed to create directory: {}", e)),
            }));
        }
    }

    // Check if it's already a git repo, if not initialize it
    if !path.join(".git").exists() {
        match std::process::Command::new("git")
            .arg("init")
            .current_dir(path)
            .output()
        {
            Ok(output) => {
                if !output.status.success() {
                    let error_msg = String::from_utf8_lossy(&output.stderr);
                    tracing::error!("Git init failed: {}", error_msg);
                    return Ok(ResponseJson(ApiResponse {
                        success: false,
                        data: None,
                        message: Some(format!("Git init failed: {}", error_msg)),
                    }));
                }
            }
            Err(e) => {
                tracing::error!("Failed to run git init: {}", e);
                return Ok(ResponseJson(ApiResponse {
                    success: false,
                    data: None,
                    message: Some(format!("Failed to run git init: {}", e)),
                }));
            }
        }
    }

    match sqlx::query_as!(
        Project,
        "INSERT INTO projects (id, name, git_repo_path, owner_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, git_repo_path, owner_id, created_at, updated_at",
        id,
        payload.name,
        payload.git_repo_path,
        auth.user_id,
        now,
        now
    )
    .fetch_one(&pool)
    .await
    {
        Ok(project) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(project),
            message: Some("Project created successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to create project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn update_project(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<PgPool>,
    Json(payload): Json<UpdateProject>
) -> Result<ResponseJson<ApiResponse<Project>>, StatusCode> {
    let now = Utc::now();

    // Check if project exists first
    let existing_project = sqlx::query_as!(
        Project,
        "SELECT id, name, git_repo_path, owner_id, created_at, updated_at FROM projects WHERE id = $1",
        id
    )
    .fetch_optional(&pool)
    .await;

    let existing_project = match existing_project {
        Ok(Some(project)) => project,
        Ok(None) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check project existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    // Use existing values if not provided in update
    let name = payload.name.unwrap_or(existing_project.name);
    let git_repo_path = payload.git_repo_path.unwrap_or(existing_project.git_repo_path);

    match sqlx::query_as!(
        Project,
        "UPDATE projects SET name = $2, git_repo_path = $3, updated_at = $4 WHERE id = $1 RETURNING id, name, git_repo_path, owner_id, created_at, updated_at",
        id,
        name,
        git_repo_path,
        now
    )
    .fetch_one(&pool)
    .await
    {
        Ok(project) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(project),
            message: Some("Project updated successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to update project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn delete_project(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<PgPool>
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    match sqlx::query!("DELETE FROM projects WHERE id = $1", id)
        .execute(&pool)
        .await
    {
        Ok(result) => {
            if result.rows_affected() == 0 {
                Err(StatusCode::NOT_FOUND)
            } else {
                Ok(ResponseJson(ApiResponse {
                    success: true,
                    data: None,
                    message: Some("Project deleted successfully".to_string()),
                }))
            }
        }
        Err(e) => {
            tracing::error!("Failed to delete project: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub fn projects_router() -> Router {
    Router::new()
        .route("/projects", get(get_projects).post(create_project))
        .route("/projects/:id", get(get_project).put(update_project).delete(delete_project))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::Extension;
    use sqlx::PgPool;
    use uuid::Uuid;
    use chrono::Utc;
    use crate::models::{user::User, project::{CreateProject, UpdateProject}};
    use crate::auth::{AuthUser, hash_password};

    async fn create_test_user(pool: &PgPool, email: &str, password: &str, is_admin: bool) -> User {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let password_hash = hash_password(password).unwrap();

        sqlx::query_as!(
            User,
            "INSERT INTO users (id, email, password_hash, is_admin, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, password_hash, is_admin, created_at, updated_at",
            id,
            email,
            password_hash,
            is_admin,
            now,
            now
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn create_test_project(pool: &PgPool, name: &str, git_repo_path: &str, owner_id: Uuid) -> Project {
        let id = Uuid::new_v4();
        let now = Utc::now();

        sqlx::query_as!(
            Project,
            "INSERT INTO projects (id, name, git_repo_path, owner_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, git_repo_path, owner_id, created_at, updated_at",
            id,
            name,
            git_repo_path,
            owner_id,
            now,
            now
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    #[sqlx::test]
    async fn test_get_projects_success(pool: PgPool) {
        let user = create_test_user(&pool, "test@example.com", "password123", false).await;
        
        // Create multiple projects
        create_test_project(&pool, "Project 1", "/tmp/test1", user.id).await;
        create_test_project(&pool, "Project 2", "/tmp/test2", user.id).await;
        create_test_project(&pool, "Project 3", "/tmp/test3", user.id).await;

        let auth = AuthUser {
            user_id: user.id,
            email: user.email,
            is_admin: false,
        };

        let result = get_projects(auth, Extension(pool)).await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert!(response.success);
        assert!(response.data.is_some());
        assert_eq!(response.data.unwrap().len(), 3);
    }

    #[sqlx::test]
    async fn test_get_projects_empty(pool: PgPool) {
        let user = create_test_user(&pool, "test@example.com", "password123", false).await;

        let auth = AuthUser {
            user_id: user.id,
            email: user.email,
            is_admin: false,
        };

        let result = get_projects(auth, Extension(pool)).await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert!(response.success);
        assert!(response.data.is_some());
        assert_eq!(response.data.unwrap().len(), 0);
    }

    #[sqlx::test]
    async fn test_get_project_success(pool: PgPool) {
        let user = create_test_user(&pool, "test@example.com", "password123", false).await;
        let project = create_test_project(&pool, "Test Project", "/tmp/test", user.id).await;

        let auth = AuthUser {
            user_id: user.id,
            email: user.email,
            is_admin: false,
        };

        let result = get_project(auth, Path(project.id), Extension(pool)).await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert!(response.success);
        assert!(response.data.is_some());
        let returned_project = response.data.unwrap();
        assert_eq!(returned_project.id, project.id);
        assert_eq!(returned_project.name, project.name);
        assert_eq!(returned_project.owner_id, project.owner_id);
    }

    #[sqlx::test]
    async fn test_get_project_not_found(pool: PgPool) {
        let user = create_test_user(&pool, "test@example.com", "password123", false).await;
        let nonexistent_project_id = Uuid::new_v4();

        let auth = AuthUser {
            user_id: user.id,
            email: user.email,
            is_admin: false,
        };

        let result = get_project(auth, Path(nonexistent_project_id), Extension(pool)).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[sqlx::test]
    async fn test_create_project_success(pool: PgPool) {
        let user = create_test_user(&pool, "test@example.com", "password123", false).await;

        let auth = AuthUser {
            user_id: user.id,
            email: user.email.clone(),
            is_admin: false,
        };

        let create_request = CreateProject {
            name: "New Project".to_string(),
            git_repo_path: "/tmp/new-project".to_string(),
        };

        let result = create_project(auth.clone(), Extension(pool), Json(create_request)).await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert!(response.success);
        assert!(response.data.is_some());
        let created_project = response.data.unwrap();
        assert_eq!(created_project.name, "New Project");
        assert_eq!(created_project.owner_id, auth.user_id);
        assert_eq!(response.message.unwrap(), "Project created successfully");
    }

    #[sqlx::test]
    async fn test_create_project_as_admin(pool: PgPool) {
        let admin_user = create_test_user(&pool, "admin@example.com", "password123", true).await;

        let auth = AuthUser {
            user_id: admin_user.id,
            email: admin_user.email.clone(),
            is_admin: true,
        };

        let create_request = CreateProject {
            name: "Admin Project".to_string(),
            git_repo_path: "/tmp/admin-project".to_string(),
        };

        let result = create_project(auth.clone(), Extension(pool), Json(create_request)).await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert!(response.success);
        assert!(response.data.is_some());
        let created_project = response.data.unwrap();
        assert_eq!(created_project.name, "Admin Project");
        assert_eq!(created_project.owner_id, auth.user_id);
    }

    #[sqlx::test]
    async fn test_update_project_success(pool: PgPool) {
        let user = create_test_user(&pool, "test@example.com", "password123", false).await;
        let project = create_test_project(&pool, "Original Name", "/tmp/original", user.id).await;

        let update_request = UpdateProject {
            name: Some("Updated Name".to_string()),
            git_repo_path: None,
        };

        let result = update_project(Path(project.id), Extension(pool), Json(update_request)).await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert!(response.success);
        assert!(response.data.is_some());
        let updated_project = response.data.unwrap();
        assert_eq!(updated_project.name, "Updated Name");
        assert_eq!(updated_project.owner_id, project.owner_id);
        assert_eq!(response.message.unwrap(), "Project updated successfully");
    }

    #[sqlx::test]
    async fn test_update_project_partial(pool: PgPool) {
        let user = create_test_user(&pool, "test@example.com", "password123", false).await;
        let project = create_test_project(&pool, "Original Name", "/tmp/original", user.id).await;

        // Update with no changes (None for name should keep existing name)
        let update_request = UpdateProject {
            name: None,
            git_repo_path: None,
        };

        let result = update_project(Path(project.id), Extension(pool), Json(update_request)).await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert!(response.success);
        assert!(response.data.is_some());
        let updated_project = response.data.unwrap();
        assert_eq!(updated_project.name, "Original Name"); // Should remain unchanged
        assert_eq!(updated_project.owner_id, project.owner_id);
    }

    #[sqlx::test]
    async fn test_update_project_not_found(pool: PgPool) {
        let nonexistent_project_id = Uuid::new_v4();

        let update_request = UpdateProject {
            name: Some("Updated Name".to_string()),
            git_repo_path: None,
        };

        let result = update_project(Path(nonexistent_project_id), Extension(pool), Json(update_request)).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[sqlx::test]
    async fn test_delete_project_success(pool: PgPool) {
        let user = create_test_user(&pool, "test@example.com", "password123", false).await;
        let project = create_test_project(&pool, "Project to Delete", "/tmp/to-delete", user.id).await;

        let result = delete_project(Path(project.id), Extension(pool)).await;
        assert!(result.is_ok());
        
        let response = result.unwrap().0;
        assert!(response.success);
        assert_eq!(response.message.unwrap(), "Project deleted successfully");
    }

    #[sqlx::test]
    async fn test_delete_project_not_found(pool: PgPool) {
        let nonexistent_project_id = Uuid::new_v4();

        let result = delete_project(Path(nonexistent_project_id), Extension(pool)).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), StatusCode::NOT_FOUND);
    }

    #[sqlx::test]
    async fn test_delete_project_cascades_to_tasks(pool: PgPool) {
        use crate::models::task::{Task, TaskStatus};
        
        let user = create_test_user(&pool, "test@example.com", "password123", false).await;
        let project = create_test_project(&pool, "Project with Tasks", "/tmp/with-tasks", user.id).await;
        
        // Create a task in the project
        let task_id = Uuid::new_v4();
        let now = Utc::now();
        sqlx::query!(
            "INSERT INTO tasks (id, project_id, title, description, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            task_id,
            project.id,
            "Test Task",
            Some("Test Description"),
            TaskStatus::Todo as TaskStatus,
            now,
            now
        )
        .execute(&pool)
        .await
        .unwrap();

        // Verify task exists
        let task_count_before = sqlx::query!(
            "SELECT COUNT(*) as count FROM tasks WHERE project_id = $1",
            project.id
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(task_count_before.count.unwrap(), 1);

        // Delete the project
        let result = delete_project(Path(project.id), Extension(pool.clone())).await;
        assert!(result.is_ok());

        // Verify tasks were cascaded (deleted)
        let task_count_after = sqlx::query!(
            "SELECT COUNT(*) as count FROM tasks WHERE project_id = $1",
            project.id
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(task_count_after.count.unwrap(), 0);
    }

    #[sqlx::test]
    async fn test_projects_belong_to_users(pool: PgPool) {
        let user1 = create_test_user(&pool, "user1@example.com", "password123", false).await;
        let user2 = create_test_user(&pool, "user2@example.com", "password123", false).await;
        
        let project1 = create_test_project(&pool, "User 1 Project", "/tmp/user1", user1.id).await;
        let project2 = create_test_project(&pool, "User 2 Project", "/tmp/user2", user2.id).await;

        // Verify project ownership
        assert_eq!(project1.owner_id, user1.id);
        assert_eq!(project2.owner_id, user2.id);
        assert_ne!(project1.owner_id, project2.owner_id);
    }
}
