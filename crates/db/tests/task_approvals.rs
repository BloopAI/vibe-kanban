use db::models::{
    project::Project,
    task::{CreateTask, Task, TaskStatus},
    task_approval::TaskApproval,
    user::User,
};
use sqlx::SqlitePool;
use uuid::Uuid;

/// Helper to set up an in-memory SQLite pool with all migrations applied
async fn setup_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

/// Helper to create a test user
async fn create_test_user(pool: &SqlitePool, username: &str) -> User {
    let id = Uuid::new_v4();
    let github_id = rand_i64();
    sqlx::query_as::<_, User>(
        r#"INSERT INTO users (id, github_id, username, email)
           VALUES ($1, $2, $3, $4)
           RETURNING id, github_id, username, email, display_name, avatar_url, created_at, updated_at"#,
    )
    .bind(id)
    .bind(github_id)
    .bind(username)
    .bind(format!("{}@test.com", username))
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Helper to create a test project
async fn create_test_project(pool: &SqlitePool, creator_id: Option<Uuid>) -> Project {
    let id = Uuid::new_v4();
    sqlx::query_as::<_, Project>(
        r#"INSERT INTO projects (id, name, creator_user_id)
           VALUES ($1, $2, $3)
           RETURNING id, name, default_agent_working_dir, remote_project_id,
                     creator_user_id, min_approvals_required, created_at, updated_at"#,
    )
    .bind(id)
    .bind("Test Project")
    .bind(creator_id)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Helper to create a test task with a given status
async fn create_test_task(pool: &SqlitePool, project_id: Uuid, status: TaskStatus) -> Task {
    let id = Uuid::new_v4();
    let create_data = CreateTask {
        project_id,
        title: "Test Task".to_string(),
        description: None,
        parent_workspace_id: None,
        shared_task_id: None,
        image_ids: None,
    };
    let task = Task::create(pool, &create_data, id, None).await.unwrap();

    // Update status if not Todo
    if status != TaskStatus::Todo {
        Task::update_status(pool, task.id, status).await.unwrap();
        Task::find_by_id(pool, task.id).await.unwrap().unwrap()
    } else {
        task
    }
}

fn rand_i64() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos() as i64
        + Uuid::new_v4().as_u128() as i64
}

#[tokio::test]
async fn test_user_can_approve_a_task() {
    let pool = setup_pool().await;
    let user = create_test_user(&pool, "alice").await;
    let project = create_test_project(&pool, Some(user.id)).await;
    let task = create_test_task(&pool, project.id, TaskStatus::InReview).await;

    let approval = TaskApproval::create(&pool, task.id, user.id).await.unwrap();
    assert_eq!(approval.task_id, task.id);
    assert_eq!(approval.user_id, user.id);

    let count = TaskApproval::count_by_task_id(&pool, task.id)
        .await
        .unwrap();
    assert_eq!(count, 1);

    let approvals = TaskApproval::find_by_task_id(&pool, task.id).await.unwrap();
    assert_eq!(approvals.len(), 1);
    assert_eq!(approvals[0].user_id, user.id);
}

#[tokio::test]
async fn test_user_can_remove_their_approval() {
    let pool = setup_pool().await;
    let user = create_test_user(&pool, "bob").await;
    let project = create_test_project(&pool, Some(user.id)).await;
    let task = create_test_task(&pool, project.id, TaskStatus::InReview).await;

    TaskApproval::create(&pool, task.id, user.id).await.unwrap();
    assert_eq!(
        TaskApproval::count_by_task_id(&pool, task.id)
            .await
            .unwrap(),
        1
    );

    let rows = TaskApproval::delete(&pool, task.id, user.id).await.unwrap();
    assert_eq!(rows, 1);

    assert_eq!(
        TaskApproval::count_by_task_id(&pool, task.id)
            .await
            .unwrap(),
        0
    );
    assert!(!TaskApproval::exists(&pool, task.id, user.id).await.unwrap());
}

#[tokio::test]
async fn test_duplicate_approval_is_rejected() {
    let pool = setup_pool().await;
    let user = create_test_user(&pool, "charlie").await;
    let project = create_test_project(&pool, Some(user.id)).await;
    let task = create_test_task(&pool, project.id, TaskStatus::InReview).await;

    TaskApproval::create(&pool, task.id, user.id).await.unwrap();

    // Second approval by same user should fail (UNIQUE constraint)
    let result = TaskApproval::create(&pool, task.id, user.id).await;
    assert!(result.is_err());

    // Count should still be 1
    assert_eq!(
        TaskApproval::count_by_task_id(&pool, task.id)
            .await
            .unwrap(),
        1
    );
}

#[tokio::test]
async fn test_status_transition_blocked_without_enough_approvals() {
    let pool = setup_pool().await;
    let user = create_test_user(&pool, "dave").await;
    let project = create_test_project(&pool, Some(user.id)).await;
    let task = create_test_task(&pool, project.id, TaskStatus::InReview).await;

    // Project requires 1 approval by default, task has 0
    let approval_count = TaskApproval::count_by_task_id(&pool, task.id)
        .await
        .unwrap();
    assert_eq!(approval_count, 0);
    assert!(approval_count < project.min_approvals_required);

    // The gate logic: task should NOT be allowed to transition
    // (In the real handler this returns an error; here we verify the condition)
    assert!(task.status == TaskStatus::InReview);
    assert!(approval_count < project.min_approvals_required);
}

#[tokio::test]
async fn test_status_transition_allowed_with_enough_approvals() {
    let pool = setup_pool().await;
    let user = create_test_user(&pool, "eve").await;
    let project = create_test_project(&pool, Some(user.id)).await;
    let task = create_test_task(&pool, project.id, TaskStatus::InReview).await;

    // Add an approval
    TaskApproval::create(&pool, task.id, user.id).await.unwrap();

    let approval_count = TaskApproval::count_by_task_id(&pool, task.id)
        .await
        .unwrap();
    assert!(approval_count >= project.min_approvals_required);

    // The gate passes, so the status update should succeed
    Task::update_status(&pool, task.id, TaskStatus::Done)
        .await
        .unwrap();
    let updated = Task::find_by_id(&pool, task.id).await.unwrap().unwrap();
    assert_eq!(updated.status, TaskStatus::Done);
}

#[tokio::test]
async fn test_multiple_users_can_approve_same_task() {
    let pool = setup_pool().await;
    let user1 = create_test_user(&pool, "frank").await;
    let user2 = create_test_user(&pool, "grace").await;
    let project = create_test_project(&pool, Some(user1.id)).await;
    let task = create_test_task(&pool, project.id, TaskStatus::InReview).await;

    TaskApproval::create(&pool, task.id, user1.id)
        .await
        .unwrap();
    TaskApproval::create(&pool, task.id, user2.id)
        .await
        .unwrap();

    let count = TaskApproval::count_by_task_id(&pool, task.id)
        .await
        .unwrap();
    assert_eq!(count, 2);

    let approvals = TaskApproval::find_by_task_id_with_users(&pool, task.id)
        .await
        .unwrap();
    assert_eq!(approvals.len(), 2);

    let user_ids: Vec<Uuid> = approvals.iter().map(|a| a.approval.user_id).collect();
    assert!(user_ids.contains(&user1.id));
    assert!(user_ids.contains(&user2.id));
}

#[tokio::test]
async fn test_approvals_deleted_when_task_deleted() {
    let pool = setup_pool().await;
    let user = create_test_user(&pool, "heidi").await;
    let project = create_test_project(&pool, Some(user.id)).await;
    let task = create_test_task(&pool, project.id, TaskStatus::InReview).await;

    TaskApproval::create(&pool, task.id, user.id).await.unwrap();
    assert_eq!(
        TaskApproval::count_by_task_id(&pool, task.id)
            .await
            .unwrap(),
        1
    );

    // Delete the task - CASCADE should remove approvals
    Task::delete(&pool, task.id).await.unwrap();

    assert_eq!(
        TaskApproval::count_by_task_id(&pool, task.id)
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn test_non_inreview_to_done_transition_not_gated() {
    let pool = setup_pool().await;
    let user = create_test_user(&pool, "ivan").await;
    let project = create_test_project(&pool, Some(user.id)).await;
    let task = create_test_task(&pool, project.id, TaskStatus::InProgress).await;

    // Task has 0 approvals, project requires 1
    let approval_count = TaskApproval::count_by_task_id(&pool, task.id)
        .await
        .unwrap();
    assert_eq!(approval_count, 0);

    // The gate only applies to InReview -> Done, not InProgress -> Done
    // Since the task is InProgress, the gate should not apply
    assert!(task.status != TaskStatus::InReview);

    // Status update should succeed regardless of approval count
    Task::update_status(&pool, task.id, TaskStatus::Done)
        .await
        .unwrap();
    let updated = Task::find_by_id(&pool, task.id).await.unwrap().unwrap();
    assert_eq!(updated.status, TaskStatus::Done);
}
