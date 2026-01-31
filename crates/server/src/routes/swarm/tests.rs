//! Tests for Swarm API Routes
//!
//! These tests use an in-memory SQLite database to test the swarm routes
//! without requiring external dependencies.

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        Router,
    };
    use db::models::{
        sandbox::{CreateSandbox, Sandbox},
        swarm::{CreateSwarm, Swarm, SwarmStatus, UpdateSwarm},
        swarm_chat::{CreateSwarmChat, SenderType, SwarmChat},
        swarm_config::SwarmConfig,
        swarm_task::{CreateSwarmTask, SwarmTask},
    };
    use serde_json::{json, Value};
    use sqlx::SqlitePool;
    use tower::ServiceExt;
    use uuid::Uuid;

    use crate::AppState;

    /// Creates an in-memory SQLite database with all required tables for testing
    async fn create_test_db() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:")
            .await
            .expect("Failed to create test database");

        // Create swarms table
        sqlx::query(
            r#"
            CREATE TABLE swarms (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
                project_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create swarms table");

        // Create swarm_chat table
        sqlx::query(
            r#"
            CREATE TABLE swarm_chat (
                id TEXT PRIMARY KEY,
                swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
                sender_type TEXT NOT NULL CHECK (sender_type IN ('system', 'user', 'sandbox')),
                sender_id TEXT,
                message TEXT NOT NULL,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create swarm_chat table");

        // Create sandboxes table
        sqlx::query(
            r#"
            CREATE TABLE sandboxes (
                id TEXT PRIMARY KEY,
                daytona_id TEXT NOT NULL,
                swarm_id TEXT REFERENCES swarms(id) ON DELETE SET NULL,
                status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'destroyed')),
                current_task_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create sandboxes table");

        // Create swarm_config table
        sqlx::query(
            r#"
            CREATE TABLE swarm_config (
                id TEXT PRIMARY KEY DEFAULT 'default',
                daytona_api_url TEXT,
                daytona_api_key TEXT,
                pool_max_sandboxes INTEGER DEFAULT 5,
                pool_idle_timeout_minutes INTEGER DEFAULT 10,
                pool_default_snapshot TEXT DEFAULT 'swarm-lite-v1',
                anthropic_api_key TEXT,
                skills_path TEXT DEFAULT '/root/.claude/skills',
                git_auto_commit INTEGER DEFAULT 1,
                git_auto_push INTEGER DEFAULT 0,
                git_token TEXT,
                trigger_enabled INTEGER DEFAULT 1,
                trigger_poll_interval_seconds INTEGER DEFAULT 5,
                trigger_execution_timeout_minutes INTEGER DEFAULT 10,
                trigger_max_retries INTEGER DEFAULT 3,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create swarm_config table");

        // Insert default config
        sqlx::query("INSERT INTO swarm_config (id) VALUES ('default')")
            .execute(&pool)
            .await
            .expect("Failed to insert default config");

        // Create swarm_tasks table
        sqlx::query(
            r#"
            CREATE TABLE swarm_tasks (
                id TEXT PRIMARY KEY,
                swarm_id TEXT NOT NULL REFERENCES swarms(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
                priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
                sandbox_id TEXT,
                depends_on TEXT,
                triggers_after TEXT,
                result TEXT,
                error TEXT,
                tags TEXT,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            "#,
        )
        .execute(&pool)
        .await
        .expect("Failed to create swarm_tasks table");

        pool
    }

    /// Creates the test app router
    fn create_test_app(state: AppState) -> Router {
        super::super::router(&state).with_state(state)
    }

    /// Helper to create a swarm directly in the database
    async fn create_test_swarm(pool: &SqlitePool, name: &str) -> Swarm {
        let swarm_id = Uuid::new_v4();
        let data = CreateSwarm {
            name: name.to_string(),
            description: Some(format!("Test swarm: {}", name)),
            project_id: None,
        };
        Swarm::create(pool, &data, swarm_id)
            .await
            .expect("Failed to create test swarm")
    }

    /// Helper to parse JSON response body
    async fn parse_response_body(response: axum::response::Response) -> Value {
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("Failed to read response body");
        serde_json::from_slice(&body).expect("Failed to parse JSON")
    }

    // =========================================================================
    // Swarm CRUD Tests
    // =========================================================================

    #[tokio::test]
    async fn test_create_swarm() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri("/swarms")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "name": "Test Swarm",
                    "description": "A test swarm for unit testing"
                })
                .to_string(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["name"], "Test Swarm");
        assert_eq!(body["data"]["description"], "A test swarm for unit testing");
        assert_eq!(body["data"]["status"], "active");
    }

    #[tokio::test]
    async fn test_create_swarm_minimal() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri("/swarms")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "name": "Minimal Swarm"
                })
                .to_string(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["name"], "Minimal Swarm");
        assert!(body["data"]["description"].is_null());
    }

    #[tokio::test]
    async fn test_list_swarms_empty() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri("/swarms")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert!(body["data"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_list_swarms_with_data() {
        let pool = create_test_db().await;

        // Create some test swarms
        create_test_swarm(&pool, "Swarm Alpha").await;
        create_test_swarm(&pool, "Swarm Beta").await;
        create_test_swarm(&pool, "Swarm Gamma").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri("/swarms")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());

        let swarms = body["data"].as_array().unwrap();
        assert_eq!(swarms.len(), 3);
    }

    #[tokio::test]
    async fn test_get_swarm() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Get Test Swarm").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri(&format!("/swarms/{}", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["id"], swarm.id.to_string());
        assert_eq!(body["data"]["name"], "Get Test Swarm");
    }

    #[tokio::test]
    async fn test_get_swarm_not_found() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let fake_id = Uuid::new_v4();
        let request = Request::builder()
            .method("GET")
            .uri(&format!("/swarms/{}", fake_id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_update_swarm() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Original Name").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("PUT")
            .uri(&format!("/swarms/{}", swarm.id))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "name": "Updated Name",
                    "description": "Updated description"
                })
                .to_string(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["name"], "Updated Name");
        assert_eq!(body["data"]["description"], "Updated description");
    }

    #[tokio::test]
    async fn test_update_swarm_status() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Status Test Swarm").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("PUT")
            .uri(&format!("/swarms/{}", swarm.id))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "status": "paused"
                })
                .to_string(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["status"], "paused");
    }

    #[tokio::test]
    async fn test_delete_swarm() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Delete Test Swarm").await;

        let state = AppState::new(pool.clone());
        let app = create_test_app(state);

        let request = Request::builder()
            .method("DELETE")
            .uri(&format!("/swarms/{}", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert!(body["data"]["deleted"].as_bool().unwrap());

        // Verify the swarm is actually deleted
        let deleted = Swarm::find_by_id(&pool, swarm.id).await.unwrap();
        assert!(deleted.is_none());
    }

    #[tokio::test]
    async fn test_delete_swarm_not_found() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let fake_id = Uuid::new_v4();
        let request = Request::builder()
            .method("DELETE")
            .uri(&format!("/swarms/{}", fake_id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    // =========================================================================
    // Swarm Lifecycle Tests (Pause/Resume)
    // =========================================================================

    #[tokio::test]
    async fn test_pause_swarm() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Pause Test Swarm").await;
        assert_eq!(swarm.status, SwarmStatus::Active);

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri(&format!("/swarms/{}/pause", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["status"], "paused");
    }

    #[tokio::test]
    async fn test_pause_already_paused_swarm() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Already Paused Swarm").await;

        // First, pause the swarm
        Swarm::update_status(&pool, swarm.id, SwarmStatus::Paused)
            .await
            .unwrap();

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri(&format!("/swarms/{}/pause", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_resume_swarm() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Resume Test Swarm").await;

        // First, pause the swarm
        Swarm::update_status(&pool, swarm.id, SwarmStatus::Paused)
            .await
            .unwrap();

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri(&format!("/swarms/{}/resume", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["status"], "active");
    }

    #[tokio::test]
    async fn test_resume_already_active_swarm() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Already Active Swarm").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri(&format!("/swarms/{}/resume", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    // =========================================================================
    // Swarm Configuration Tests
    // =========================================================================

    #[tokio::test]
    async fn test_get_config() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri("/config/swarm")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        // SwarmConfigWithMaskedSecrets uses #[serde(flatten)] so fields are at data level
        assert_eq!(body["data"]["pool_max_sandboxes"], 5);
        assert_eq!(body["data"]["pool_idle_timeout_minutes"], 10);
        assert_eq!(body["data"]["pool_default_snapshot"], "swarm-lite-v1");
        assert!(body["data"]["trigger_enabled"].as_bool().unwrap());
    }

    #[tokio::test]
    async fn test_update_config() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("PUT")
            .uri("/config/swarm")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "pool_max_sandboxes": 10,
                    "trigger_enabled": false,
                    "daytona_api_url": "https://api.example.com"
                })
                .to_string(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        // SwarmConfigWithMaskedSecrets uses #[serde(flatten)] so fields are at data level
        assert_eq!(body["data"]["pool_max_sandboxes"], 10);
        assert!(!body["data"]["trigger_enabled"].as_bool().unwrap());
        assert_eq!(body["data"]["daytona_api_url"], "https://api.example.com");
    }

    #[tokio::test]
    async fn test_config_test_connection_no_url() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri("/config/swarm/test")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert!(!body["data"]["success"].as_bool().unwrap());
        assert!(body["data"]["message"]
            .as_str()
            .unwrap()
            .contains("not configured"));
    }

    #[tokio::test]
    async fn test_config_status() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri("/config/swarm/status")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert!(!body["data"]["daytona_connected"].as_bool().unwrap());
        assert_eq!(body["data"]["pool_active_count"], 0);
        assert!(body["data"]["trigger_enabled"].as_bool().unwrap());
    }

    // =========================================================================
    // Pool Management Tests
    // =========================================================================

    #[tokio::test]
    async fn test_get_pool_status_empty() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri("/pool")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["total"], 0);
        assert_eq!(body["data"]["idle"], 0);
        assert_eq!(body["data"]["busy"], 0);
        assert!(body["data"]["sandboxes"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_get_pool_status_with_sandboxes() {
        let pool = create_test_db().await;

        // Create some test sandboxes
        let sandbox1_id = Uuid::new_v4();
        let sandbox2_id = Uuid::new_v4();

        Sandbox::create(
            &pool,
            &CreateSandbox {
                daytona_id: "daytona-1".to_string(),
                swarm_id: None,
            },
            sandbox1_id,
        )
        .await
        .unwrap();

        Sandbox::create(
            &pool,
            &CreateSandbox {
                daytona_id: "daytona-2".to_string(),
                swarm_id: None,
            },
            sandbox2_id,
        )
        .await
        .unwrap();

        // Mark one as busy
        Sandbox::update_status(&pool, sandbox2_id, db::models::sandbox::SandboxStatus::Busy)
            .await
            .unwrap();

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri("/pool")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["total"], 2);
        assert_eq!(body["data"]["idle"], 1);
        assert_eq!(body["data"]["busy"], 1);
    }

    #[tokio::test]
    async fn test_get_sandbox() {
        let pool = create_test_db().await;

        let sandbox_id = Uuid::new_v4();
        Sandbox::create(
            &pool,
            &CreateSandbox {
                daytona_id: "test-daytona-id".to_string(),
                swarm_id: None,
            },
            sandbox_id,
        )
        .await
        .unwrap();

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri(&format!("/pool/{}", sandbox_id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["id"], sandbox_id.to_string());
        assert_eq!(body["data"]["daytona_id"], "test-daytona-id");
    }

    #[tokio::test]
    async fn test_get_sandbox_not_found() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let fake_id = Uuid::new_v4();
        let request = Request::builder()
            .method("GET")
            .uri(&format!("/pool/{}", fake_id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_destroy_sandbox() {
        let pool = create_test_db().await;

        let sandbox_id = Uuid::new_v4();
        Sandbox::create(
            &pool,
            &CreateSandbox {
                daytona_id: "destroy-test".to_string(),
                swarm_id: None,
            },
            sandbox_id,
        )
        .await
        .unwrap();

        let state = AppState::new(pool.clone());
        let app = create_test_app(state);

        let request = Request::builder()
            .method("DELETE")
            .uri(&format!("/pool/{}", sandbox_id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert!(body["data"]["success"].as_bool().unwrap());

        // Verify sandbox is marked as destroyed
        let sandbox = Sandbox::find_by_id(&pool, sandbox_id).await.unwrap().unwrap();
        assert_eq!(sandbox.status, db::models::sandbox::SandboxStatus::Destroyed);
    }

    #[tokio::test]
    async fn test_cleanup_pool() {
        let pool = create_test_db().await;

        // Create some idle sandboxes
        for i in 0..3 {
            let sandbox_id = Uuid::new_v4();
            Sandbox::create(
                &pool,
                &CreateSandbox {
                    daytona_id: format!("idle-{}", i),
                    swarm_id: None,
                },
                sandbox_id,
            )
            .await
            .unwrap();
        }

        let state = AppState::new(pool.clone());
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri("/pool/cleanup")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert!(body["data"]["success"].as_bool().unwrap());
        assert_eq!(body["data"]["cleaned"], 3);
        assert_eq!(body["data"]["remaining"], 0);
    }

    // =========================================================================
    // Swarm Chat Tests
    // =========================================================================

    #[tokio::test]
    async fn test_get_chat_messages_empty() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Chat Test Swarm").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri(&format!("/swarms/{}/chat", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert!(body["data"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_post_chat_message() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Chat Post Swarm").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri(&format!("/swarms/{}/chat", swarm.id))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "sender_type": "user",
                    "message": "Hello, swarm!"
                })
                .to_string(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["message"], "Hello, swarm!");
        assert_eq!(body["data"]["sender_type"], "user");
        assert_eq!(body["data"]["swarm_id"], swarm.id.to_string());
    }

    #[tokio::test]
    async fn test_get_chat_messages_with_data() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Chat Data Swarm").await;

        // Create some chat messages
        for i in 0..5 {
            let msg_id = Uuid::new_v4();
            SwarmChat::create(
                &pool,
                &CreateSwarmChat {
                    swarm_id: swarm.id,
                    sender_type: SenderType::User,
                    sender_id: None,
                    message: format!("Message {}", i),
                    metadata: None,
                },
                msg_id,
            )
            .await
            .unwrap();
        }

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri(&format!("/swarms/{}/chat", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"].as_array().unwrap().len(), 5);
    }

    #[tokio::test]
    async fn test_get_chat_messages_with_limit() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Chat Limit Swarm").await;

        // Create 10 messages
        for i in 0..10 {
            let msg_id = Uuid::new_v4();
            SwarmChat::create(
                &pool,
                &CreateSwarmChat {
                    swarm_id: swarm.id,
                    sender_type: SenderType::System,
                    sender_id: None,
                    message: format!("System message {}", i),
                    metadata: None,
                },
                msg_id,
            )
            .await
            .unwrap();
        }

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri(&format!("/swarms/{}/chat?limit=3", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"].as_array().unwrap().len(), 3);
    }

    // =========================================================================
    // Swarm Tasks Tests
    // =========================================================================

    #[tokio::test]
    async fn test_list_tasks_empty() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Tasks Test Swarm").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri(&format!("/swarms/{}/tasks", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        // The tasks endpoint returns empty list (TODO implementation)
        assert!(body["data"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_create_task() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Task Create Swarm").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri(&format!("/swarms/{}/tasks", swarm.id))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "title": "Test Task",
                    "description": "A test task",
                    "priority": "high",
                    "tags": ["test", "unit"]
                })
                .to_string(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["title"], "Test Task");
        assert_eq!(body["data"]["description"], "A test task");
        assert_eq!(body["data"]["priority"], "high");
        assert_eq!(body["data"]["status"], "pending");
        assert_eq!(body["data"]["swarm_id"], swarm.id.to_string());
    }

    #[tokio::test]
    async fn test_create_task_minimal() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Task Minimal Swarm").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("POST")
            .uri(&format!("/swarms/{}/tasks", swarm.id))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "title": "Minimal Task"
                })
                .to_string(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["title"], "Minimal Task");
        assert_eq!(body["data"]["priority"], "medium"); // default
    }

    // =========================================================================
    // IDOR Protection Tests
    // =========================================================================

    /// Helper function to create a test task directly in the database
    async fn create_test_task(pool: &SqlitePool, swarm_id: Uuid, title: &str) -> SwarmTask {
        let task_id = Uuid::new_v4();
        SwarmTask::create(
            pool,
            swarm_id,
            &CreateSwarmTask {
                title: title.to_string(),
                description: None,
                priority: None,
                depends_on: None,
                tags: None,
            },
            task_id,
        )
        .await
        .expect("Failed to create test task")
    }

    #[tokio::test]
    async fn test_get_task_idor_protection() {
        let pool = create_test_db().await;

        // Create two swarms
        let swarm_a = create_test_swarm(&pool, "Swarm A").await;
        let swarm_b = create_test_swarm(&pool, "Swarm B").await;

        // Create a task in swarm A
        let task = create_test_task(&pool, swarm_a.id, "Task in Swarm A").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        // Try to access task from swarm A using swarm B's ID (IDOR attempt)
        let request = Request::builder()
            .method("GET")
            .uri(&format!("/swarms/{}/tasks/{}", swarm_b.id, task.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // Should return 400 Bad Request (task not found in this swarm)
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let body = parse_response_body(response).await;
        assert!(!body["success"].as_bool().unwrap());
    }

    #[tokio::test]
    async fn test_update_task_idor_protection() {
        let pool = create_test_db().await;

        // Create two swarms
        let swarm_a = create_test_swarm(&pool, "Swarm A").await;
        let swarm_b = create_test_swarm(&pool, "Swarm B").await;

        // Create a task in swarm A
        let task = create_test_task(&pool, swarm_a.id, "Task in Swarm A").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        // Try to update task from swarm A using swarm B's ID (IDOR attempt)
        let request = Request::builder()
            .method("PATCH")
            .uri(&format!("/swarms/{}/tasks/{}", swarm_b.id, task.id))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "title": "Hacked Title"
                })
                .to_string(),
            ))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // Should return 400 Bad Request (task not found in this swarm)
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let body = parse_response_body(response).await;
        assert!(!body["success"].as_bool().unwrap());
    }

    #[tokio::test]
    async fn test_delete_task_idor_protection() {
        let pool = create_test_db().await;

        // Create two swarms
        let swarm_a = create_test_swarm(&pool, "Swarm A").await;
        let swarm_b = create_test_swarm(&pool, "Swarm B").await;

        // Create a task in swarm A
        let task = create_test_task(&pool, swarm_a.id, "Task in Swarm A").await;

        let state = AppState::new(pool.clone());
        let app = create_test_app(state);

        // Try to delete task from swarm A using swarm B's ID (IDOR attempt)
        let request = Request::builder()
            .method("DELETE")
            .uri(&format!("/swarms/{}/tasks/{}", swarm_b.id, task.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // Should return 400 Bad Request (task not found in this swarm)
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        // Verify task still exists (was not deleted)
        let still_exists = SwarmTask::find_by_id(&pool, task.id).await.unwrap();
        assert!(still_exists.is_some());
    }

    #[tokio::test]
    async fn test_get_task_correct_swarm() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Test Swarm").await;
        let task = create_test_task(&pool, swarm.id, "Test Task").await;

        let state = AppState::new(pool);
        let app = create_test_app(state);

        // Access task with correct swarm ID
        let request = Request::builder()
            .method("GET")
            .uri(&format!("/swarms/{}/tasks/{}", swarm.id, task.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // Should return 200 OK
        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
        assert_eq!(body["data"]["id"], task.id.to_string());
        assert_eq!(body["data"]["title"], "Test Task");
    }

    #[tokio::test]
    async fn test_task_not_found() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Test Swarm").await;
        let fake_task_id = Uuid::new_v4();

        let state = AppState::new(pool);
        let app = create_test_app(state);

        // Try to access non-existent task
        let request = Request::builder()
            .method("GET")
            .uri(&format!("/swarms/{}/tasks/{}", swarm.id, fake_task_id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // Should return 400 Bad Request
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    // =========================================================================
    // Delete Swarm Cascading Tests
    // =========================================================================

    #[tokio::test]
    async fn test_delete_swarm_cascades_chat_messages() {
        let pool = create_test_db().await;
        let swarm = create_test_swarm(&pool, "Cascade Delete Swarm").await;

        // Create some chat messages
        for i in 0..3 {
            let msg_id = Uuid::new_v4();
            SwarmChat::create(
                &pool,
                &CreateSwarmChat {
                    swarm_id: swarm.id,
                    sender_type: SenderType::User,
                    sender_id: None,
                    message: format!("Message {}", i),
                    metadata: None,
                },
                msg_id,
            )
            .await
            .unwrap();
        }

        // Verify messages exist
        let messages_before = SwarmChat::find_by_swarm_id(&pool, swarm.id, None)
            .await
            .unwrap();
        assert_eq!(messages_before.len(), 3);

        let state = AppState::new(pool.clone());
        let app = create_test_app(state);

        let request = Request::builder()
            .method("DELETE")
            .uri(&format!("/swarms/{}", swarm.id))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        // Verify messages are deleted
        let messages_after = SwarmChat::find_by_swarm_id(&pool, swarm.id, None)
            .await
            .unwrap();
        assert!(messages_after.is_empty());
    }

    // =========================================================================
    // Skills Tests
    // =========================================================================

    #[tokio::test]
    async fn test_list_skills_no_config() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri("/skills")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        // Should return empty array when no skills dir configured
        assert_eq!(response.status(), StatusCode::OK);

        let body = parse_response_body(response).await;
        assert!(body["success"].as_bool().unwrap());
    }

    #[tokio::test]
    async fn test_list_skills_with_search() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri("/skills?q=test")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_get_skill_not_found() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri("/skills/nonexistent-skill")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_get_skill_path_traversal_blocked() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        // Test path traversal is blocked
        let request = Request::builder()
            .method("GET")
            .uri("/skills/..%2F..%2Fetc%2Fpasswd")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_get_skill_invalid_name_with_slash() {
        let pool = create_test_db().await;
        let state = AppState::new(pool);
        let app = create_test_app(state);

        let request = Request::builder()
            .method("GET")
            .uri("/skills/path/to/skill")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        // Axum returns 404 because /skills/path/to/skill doesn't match /skills/{name}
        // The route only captures a single path segment, so this is correctly rejected
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
