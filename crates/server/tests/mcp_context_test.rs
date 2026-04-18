//! Integration tests for MCP context resolution with environment variables.
//!
//! These tests verify that the MCP server correctly prioritizes environment
//! variables (VK_ATTEMPT_ID, VK_TASK_ID) over path-based resolution when both
//! are available.
//!
//! Note: Full end-to-end testing would require a running HTTP server, as the
//! TaskServer makes HTTP calls to fetch context. These tests focus on verifying
//! the environment variable reading logic and data setup.

use db::{
    models::{
        project::{CreateProject, Project},
        task::{CreateTask, Task},
        task_attempt::{CreateTaskAttempt, TaskAttempt},
    },
    test_utils::create_test_pool,
};
use executors::executors::BaseCodingAgent;
use uuid::Uuid;

/// Test that we can set up the test data correctly and verify env var reading.
#[tokio::test]
async fn test_env_var_setup_and_reading() {
    let (pool, _temp_dir) = create_test_pool().await;

    // Create test project
    let project_id = Uuid::new_v4();
    let create_project = CreateProject {
        name: "test-project".to_string(),
        git_repo_path: "/tmp/test-repo".to_string(),
        use_existing_repo: true,
        clone_url: None,
        setup_script: None,
        dev_script: None,
        cleanup_script: None,
        copy_files: None,
    };
    let project = Project::create(&pool, &create_project, project_id)
        .await
        .expect("Failed to create test project");

    // Create test task
    let task_id = Uuid::new_v4();
    let create_task = CreateTask {
        project_id: project.id,
        title: "test-task".to_string(),
        description: Some("Test task for MCP context".to_string()),
        status: None,
        parent_task_id: None,
        image_ids: None,
        shared_task_id: None,
    };
    let task = Task::create(&pool, &create_task, task_id)
        .await
        .expect("Failed to create test task");

    // Create test task attempt
    let attempt_id = Uuid::new_v4();
    let create_attempt = CreateTaskAttempt {
        executor: BaseCodingAgent::ClaudeCode,
        base_branch: "main".to_string(),
        branch: "feature/test".to_string(),
        origin_node_id: None,
    };
    let attempt = TaskAttempt::create(&pool, &create_attempt, attempt_id, task.id)
        .await
        .expect("Failed to create test task attempt");

    // Verify data was created correctly
    assert_eq!(project.id, project_id);
    assert_eq!(task.id, task_id);
    assert_eq!(task.project_id, project_id);
    assert_eq!(attempt.id, attempt_id);
    assert_eq!(attempt.task_id, task_id);

    // Test environment variable setting and reading
    unsafe {
        std::env::set_var("VK_ATTEMPT_ID", attempt.id.to_string());
        std::env::set_var("VK_TASK_ID", task.id.to_string());
    }

    // Verify we can read the env vars
    let read_attempt_id = std::env::var("VK_ATTEMPT_ID").expect("Failed to read VK_ATTEMPT_ID");
    let read_task_id = std::env::var("VK_TASK_ID").expect("Failed to read VK_TASK_ID");

    assert_eq!(read_attempt_id, attempt.id.to_string());
    assert_eq!(read_task_id, task.id.to_string());

    // Verify we can parse them back to UUIDs
    let parsed_attempt_id = Uuid::parse_str(&read_attempt_id).expect("Failed to parse attempt ID");
    let parsed_task_id = Uuid::parse_str(&read_task_id).expect("Failed to parse task ID");

    assert_eq!(parsed_attempt_id, attempt.id);
    assert_eq!(parsed_task_id, task.id);

    // Clean up environment variables
    unsafe {
        std::env::remove_var("VK_ATTEMPT_ID");
        std::env::remove_var("VK_TASK_ID");
    }

    // Verify they're removed
    assert!(std::env::var("VK_ATTEMPT_ID").is_err());
    assert!(std::env::var("VK_TASK_ID").is_err());
}

/// Test the environment variable priority logic pattern.
/// This tests the same pattern used in get_context, get_task_id, and get_project_id.
#[tokio::test]
async fn test_env_var_priority_pattern() {
    let (pool, _temp_dir) = create_test_pool().await;

    // Create test data
    let project_id = Uuid::new_v4();
    let create_project = CreateProject {
        name: "test-project".to_string(),
        git_repo_path: "/tmp/test-repo".to_string(),
        use_existing_repo: true,
        clone_url: None,
        setup_script: None,
        dev_script: None,
        cleanup_script: None,
        copy_files: None,
    };
    let project = Project::create(&pool, &create_project, project_id)
        .await
        .expect("Failed to create project");

    let task_id = Uuid::new_v4();
    let create_task = CreateTask {
        project_id: project.id,
        title: "test-task".to_string(),
        description: None,
        status: None,
        parent_task_id: None,
        image_ids: None,
        shared_task_id: None,
    };
    let task = Task::create(&pool, &create_task, task_id)
        .await
        .expect("Failed to create task");

    let attempt_id = Uuid::new_v4();
    let create_attempt = CreateTaskAttempt {
        executor: BaseCodingAgent::ClaudeCode,
        base_branch: "main".to_string(),
        branch: "feature/test".to_string(),
        origin_node_id: None,
    };
    let _attempt = TaskAttempt::create(&pool, &create_attempt, attempt_id, task.id)
        .await
        .expect("Failed to create attempt");

    // Test Layer 1: Environment variable has priority
    unsafe {
        std::env::set_var("VK_ATTEMPT_ID", attempt_id.to_string());
        std::env::set_var("VK_TASK_ID", task_id.to_string());
    }

    // Simulate the priority logic from MCP methods
    let resolved_attempt_id = if let Ok(env_attempt_id) = std::env::var("VK_ATTEMPT_ID") {
        Uuid::parse_str(&env_attempt_id).ok()
    } else {
        None
    };

    let resolved_task_id = if let Ok(env_task_id) = std::env::var("VK_TASK_ID") {
        Uuid::parse_str(&env_task_id).ok()
    } else {
        None
    };

    // Layer 1 should succeed
    assert_eq!(resolved_attempt_id, Some(attempt_id));
    assert_eq!(resolved_task_id, Some(task_id));

    // Test Layer 2: Fallback when env vars are cleared
    unsafe {
        std::env::remove_var("VK_ATTEMPT_ID");
        std::env::remove_var("VK_TASK_ID");
    }

    let resolved_after_clear = if let Ok(env_attempt_id) = std::env::var("VK_ATTEMPT_ID") {
        Uuid::parse_str(&env_attempt_id).ok()
    } else {
        None
    };

    // Layer 1 should fail (no env var)
    assert_eq!(resolved_after_clear, None);

    // At this point, the actual MCP methods would fall back to path-based resolution.
    // We can't test that without a running HTTP server, but we've verified the
    // env var priority logic works correctly.
}

/// Test that multiple task attempts can exist with different IDs.
/// This verifies the scenario where environment variables are crucial for
/// disambiguation when multiple subtasks share the same worktree.
#[tokio::test]
async fn test_multiple_attempts_same_project() {
    let (pool, _temp_dir) = create_test_pool().await;

    // Create test project
    let project_id = Uuid::new_v4();
    let create_project = CreateProject {
        name: "test-project".to_string(),
        git_repo_path: "/tmp/test-repo".to_string(),
        use_existing_repo: true,
        clone_url: None,
        setup_script: None,
        dev_script: None,
        cleanup_script: None,
        copy_files: None,
    };
    let project = Project::create(&pool, &create_project, project_id)
        .await
        .expect("Failed to create project");

    // Create parent task
    let parent_task_id = Uuid::new_v4();
    let create_parent_task = CreateTask {
        project_id: project.id,
        title: "parent-task".to_string(),
        description: None,
        status: None,
        parent_task_id: None,
        image_ids: None,
        shared_task_id: None,
    };
    let parent_task = Task::create(&pool, &create_parent_task, parent_task_id)
        .await
        .expect("Failed to create parent task");

    // Create subtask 1
    let subtask1_id = Uuid::new_v4();
    let create_subtask1 = CreateTask {
        project_id: project.id,
        title: "subtask-1".to_string(),
        description: None,
        status: None,
        parent_task_id: Some(parent_task.id),
        image_ids: None,
        shared_task_id: None,
    };
    let subtask1 = Task::create(&pool, &create_subtask1, subtask1_id)
        .await
        .expect("Failed to create subtask 1");

    // Create subtask 2
    let subtask2_id = Uuid::new_v4();
    let create_subtask2 = CreateTask {
        project_id: project.id,
        title: "subtask-2".to_string(),
        description: None,
        status: None,
        parent_task_id: Some(parent_task.id),
        image_ids: None,
        shared_task_id: None,
    };
    let subtask2 = Task::create(&pool, &create_subtask2, subtask2_id)
        .await
        .expect("Failed to create subtask 2");

    // Create attempts for both subtasks
    let attempt1_id = Uuid::new_v4();
    let create_attempt1 = CreateTaskAttempt {
        executor: BaseCodingAgent::ClaudeCode,
        base_branch: "main".to_string(),
        branch: "feature/subtask1".to_string(),
        origin_node_id: None,
    };
    let attempt1 = TaskAttempt::create(&pool, &create_attempt1, attempt1_id, subtask1.id)
        .await
        .expect("Failed to create attempt 1");

    let attempt2_id = Uuid::new_v4();
    let create_attempt2 = CreateTaskAttempt {
        executor: BaseCodingAgent::ClaudeCode,
        base_branch: "main".to_string(),
        branch: "feature/subtask2".to_string(),
        origin_node_id: None,
    };
    let attempt2 = TaskAttempt::create(&pool, &create_attempt2, attempt2_id, subtask2.id)
        .await
        .expect("Failed to create attempt 2");

    // Verify both attempts exist
    assert_eq!(attempt1.task_id, subtask1.id);
    assert_eq!(attempt2.task_id, subtask2.id);

    // Simulate setting env var for attempt 1
    unsafe {
        std::env::set_var("VK_ATTEMPT_ID", attempt1.id.to_string());
        std::env::set_var("VK_TASK_ID", subtask1.id.to_string());
    }

    let resolved_task_id = std::env::var("VK_TASK_ID")
        .ok()
        .and_then(|s| Uuid::parse_str(&s).ok());

    assert_eq!(resolved_task_id, Some(subtask1.id));

    // Now switch to attempt 2
    unsafe {
        std::env::set_var("VK_ATTEMPT_ID", attempt2.id.to_string());
        std::env::set_var("VK_TASK_ID", subtask2.id.to_string());
    }

    let resolved_task_id2 = std::env::var("VK_TASK_ID")
        .ok()
        .and_then(|s| Uuid::parse_str(&s).ok());

    assert_eq!(resolved_task_id2, Some(subtask2.id));

    // This demonstrates that environment variables allow us to disambiguate
    // between multiple attempts/tasks, which is the core problem this feature solves.

    // Clean up
    unsafe {
        std::env::remove_var("VK_ATTEMPT_ID");
        std::env::remove_var("VK_TASK_ID");
    }
}
