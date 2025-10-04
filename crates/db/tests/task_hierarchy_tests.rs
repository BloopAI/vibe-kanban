use db::models::{
    project::{CreateProject, Project},
    task::{CreateTask, Task, UpdateTask},
};
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use uuid::Uuid;

/// Helper to create a test database with migrations applied
async fn setup_test_db() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("Failed to create test database");

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    pool
}

/// Helper to create a test project
async fn create_test_project(pool: &SqlitePool, name: &str) -> Project {
    let create_project = CreateProject {
        name: name.to_string(),
        git_repo_path: "/tmp/test-repo".to_string(),
        use_existing_repo: false,
        setup_script: None,
        dev_script: None,
        cleanup_script: None,
        copy_files: None,
    };

    Project::create(pool, &create_project, Uuid::new_v4())
        .await
        .expect("Failed to create test project")
}

#[tokio::test]
async fn test_create_task_with_parent_task_id() {
    let pool = setup_test_db().await;
    let project = create_test_project(&pool, "Test Project").await;

    // Create parent task
    let parent_task = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Parent Task".to_string(),
            description: Some("This is the parent task".to_string()),
            parent_task_attempt: None,
            parent_task_id: None,
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create parent task");

    // Create child task with parent_task_id
    let child_task = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Child Task".to_string(),
            description: Some("This is a child task".to_string()),
            parent_task_attempt: None,
            parent_task_id: Some(parent_task.id),
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create child task");

    // Verify the child task has the correct parent_task_id
    assert_eq!(child_task.parent_task_id, Some(parent_task.id));
    assert_eq!(child_task.project_id, project.id);
    assert_eq!(child_task.title, "Child Task");
}

#[tokio::test]
async fn test_find_children_by_task_id() {
    let pool = setup_test_db().await;
    let project = create_test_project(&pool, "Test Project").await;

    // Create parent task
    let parent_task = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Parent Task".to_string(),
            description: None,
            parent_task_attempt: None,
            parent_task_id: None,
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create parent task");

    // Create multiple child tasks
    let child1 = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Child Task 1".to_string(),
            description: None,
            parent_task_attempt: None,
            parent_task_id: Some(parent_task.id),
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create child task 1");

    let child2 = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Child Task 2".to_string(),
            description: None,
            parent_task_attempt: None,
            parent_task_id: Some(parent_task.id),
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create child task 2");

    // Find children by parent task ID
    let children = Task::find_children_by_task_id(&pool, parent_task.id)
        .await
        .expect("Failed to find children");

    // Verify we got both children
    assert_eq!(children.len(), 2);

    let child_ids: Vec<Uuid> = children.iter().map(|c| c.id).collect();
    assert!(child_ids.contains(&child1.id));
    assert!(child_ids.contains(&child2.id));

    // Verify all children have the correct parent_task_id
    for child in &children {
        assert_eq!(child.parent_task_id, Some(parent_task.id));
    }
}

#[tokio::test]
async fn test_nested_task_hierarchy() {
    let pool = setup_test_db().await;
    let project = create_test_project(&pool, "Test Project").await;

    // Create grandparent task
    let grandparent = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Grandparent Task".to_string(),
            description: None,
            parent_task_attempt: None,
            parent_task_id: None,
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create grandparent task");

    // Create parent task (child of grandparent)
    let parent = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Parent Task".to_string(),
            description: None,
            parent_task_attempt: None,
            parent_task_id: Some(grandparent.id),
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create parent task");

    // Create child task (child of parent)
    let child = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Child Task".to_string(),
            description: None,
            parent_task_attempt: None,
            parent_task_id: Some(parent.id),
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create child task");

    // Verify the hierarchy
    let grandparent_children = Task::find_children_by_task_id(&pool, grandparent.id)
        .await
        .expect("Failed to find grandparent's children");
    assert_eq!(grandparent_children.len(), 1);
    assert_eq!(grandparent_children[0].id, parent.id);

    let parent_children = Task::find_children_by_task_id(&pool, parent.id)
        .await
        .expect("Failed to find parent's children");
    assert_eq!(parent_children.len(), 1);
    assert_eq!(parent_children[0].id, child.id);

    // Child should have no children
    let child_children = Task::find_children_by_task_id(&pool, child.id)
        .await
        .expect("Failed to find child's children");
    assert_eq!(child_children.len(), 0);
}

#[tokio::test]
async fn test_update_task_parent_task_id() {
    let pool = setup_test_db().await;
    let project = create_test_project(&pool, "Test Project").await;

    // Create two potential parent tasks
    let parent1 = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Parent 1".to_string(),
            description: None,
            parent_task_attempt: None,
            parent_task_id: None,
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create parent1");

    let parent2 = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Parent 2".to_string(),
            description: None,
            parent_task_attempt: None,
            parent_task_id: None,
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create parent2");

    // Create child task initially with parent1
    let child = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Child Task".to_string(),
            description: None,
            parent_task_attempt: None,
            parent_task_id: Some(parent1.id),
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create child");

    assert_eq!(child.parent_task_id, Some(parent1.id));

    // Update child to be under parent2
    let updated_child = Task::update(
        &pool,
        child.id,
        project.id,
        UpdateTask {
            title: Some(child.title.clone()),
            description: child.description.clone(),
            status: Some(child.status.clone()),
            parent_task_attempt: child.parent_task_attempt,
            parent_task_id: Some(parent2.id),
            image_ids: None,
        },
    )
    .await
    .expect("Failed to update child task");

    assert_eq!(updated_child.parent_task_id, Some(parent2.id));

    // Verify parent1 has no children now
    let parent1_children = Task::find_children_by_task_id(&pool, parent1.id)
        .await
        .expect("Failed to find parent1 children");
    assert_eq!(parent1_children.len(), 0);

    // Verify parent2 has the child now
    let parent2_children = Task::find_children_by_task_id(&pool, parent2.id)
        .await
        .expect("Failed to find parent2 children");
    assert_eq!(parent2_children.len(), 1);
    assert_eq!(parent2_children[0].id, child.id);
}

#[tokio::test]
async fn test_task_without_parent() {
    let pool = setup_test_db().await;
    let project = create_test_project(&pool, "Test Project").await;

    // Create task without parent
    let task = Task::create(
        &pool,
        &CreateTask {
            project_id: project.id,
            title: "Standalone Task".to_string(),
            description: None,
            parent_task_attempt: None,
            parent_task_id: None,
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .expect("Failed to create task");

    // Verify task has no parent
    assert_eq!(task.parent_task_id, None);
    assert_eq!(task.parent_task_attempt, None);
}
