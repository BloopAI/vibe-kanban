//! CLI tool to clean up duplicate tasks created by the swarm sync issue.
//!
//! Duplicates are identified as tasks that:
//! 1. Have a shared_task_id
//! 2. Have NO task_attempts
//! 3. Another task with the SAME shared_task_id DOES have attempts
//!
//! Usage:
//!   cargo run --bin cleanup_duplicate_tasks           # Dry-run (default)
//!   cargo run --bin cleanup_duplicate_tasks --execute # Actually delete
//!   cargo run --bin cleanup_duplicate_tasks --verbose # Show details

use std::env;
use std::io::{self, Write};

use chrono::{DateTime, Utc};
use db::DBService;
use sqlx::SqlitePool;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
struct DuplicateTask {
    id: Uuid,
    title: String,
    shared_task_id: Uuid,
    is_remote: bool,
    created_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
struct OrphanedDuplicate {
    id: Uuid,
    title: String,
    shared_task_id: Uuid,
    is_remote: bool,
    created_at: DateTime<Utc>,
}

struct CleanupResult {
    duplicates_found: usize,
    deleted: usize,
    errors: usize,
}

/// Find duplicate tasks: tasks with shared_task_id that have no attempts,
/// where another task with the same shared_task_id DOES have attempts.
async fn find_duplicates(pool: &SqlitePool) -> Result<Vec<DuplicateTask>, sqlx::Error> {
    sqlx::query_as::<_, DuplicateTask>(
        r#"
        SELECT
            t.id as "id: Uuid",
            t.title,
            t.shared_task_id as "shared_task_id: Uuid",
            t.is_remote as "is_remote: bool",
            t.created_at as "created_at: DateTime<Utc>"
        FROM tasks t
        WHERE t.shared_task_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM task_attempts ta WHERE ta.task_id = t.id)
          AND EXISTS (
              SELECT 1 FROM tasks t2
              WHERE t2.shared_task_id = t.shared_task_id
                AND t2.id != t.id
                AND EXISTS (SELECT 1 FROM task_attempts ta2 WHERE ta2.task_id = t2.id)
          )
        ORDER BY t.created_at
        "#,
    )
    .fetch_all(pool)
    .await
}

/// Find orphaned duplicates: pairs of tasks with the same shared_task_id
/// where NEITHER has attempts. We'll keep the better one.
async fn find_orphaned_duplicates(pool: &SqlitePool) -> Result<Vec<OrphanedDuplicate>, sqlx::Error> {
    // Find tasks that are duplicates (same shared_task_id) where neither has attempts
    // We return all of them, then in processing we'll decide which to keep
    sqlx::query_as::<_, OrphanedDuplicate>(
        r#"
        SELECT
            t.id as "id: Uuid",
            t.title,
            t.shared_task_id as "shared_task_id: Uuid",
            t.is_remote as "is_remote: bool",
            t.created_at as "created_at: DateTime<Utc>"
        FROM tasks t
        WHERE t.shared_task_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM task_attempts ta WHERE ta.task_id = t.id)
          AND EXISTS (
              SELECT 1 FROM tasks t2
              WHERE t2.shared_task_id = t.shared_task_id
                AND t2.id != t.id
                AND NOT EXISTS (SELECT 1 FROM task_attempts ta2 WHERE ta2.task_id = t2.id)
          )
        ORDER BY t.shared_task_id, t.is_remote ASC, t.created_at ASC
        "#,
    )
    .fetch_all(pool)
    .await
}

/// Delete a task by ID
async fn delete_task(pool: &SqlitePool, task_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM tasks WHERE id = ?")
        .bind(task_id)
        .execute(pool)
        .await?;
    Ok(())
}

fn print_task(task: &DuplicateTask, verbose: bool) {
    if verbose {
        println!(
            "  - ID: {}\n    Title: {}\n    SharedTaskID: {}\n    IsRemote: {}\n    Created: {}",
            task.id, task.title, task.shared_task_id, task.is_remote, task.created_at
        );
    } else {
        println!("  - {} ({})", task.title, task.id);
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    // Parse arguments
    let args: Vec<String> = env::args().collect();
    let execute = args.iter().any(|a| a == "--execute");
    let verbose = args.iter().any(|a| a == "--verbose");

    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!("Cleanup Duplicate Tasks");
        println!();
        println!("This tool identifies and removes duplicate tasks created by the swarm sync issue.");
        println!();
        println!("Usage:");
        println!("  cleanup_duplicate_tasks              Dry-run mode (default)");
        println!("  cleanup_duplicate_tasks --execute    Actually delete duplicates");
        println!("  cleanup_duplicate_tasks --verbose    Show detailed task info");
        println!("  cleanup_duplicate_tasks --help       Show this help");
        println!();
        println!("Duplicates are tasks that:");
        println!("  1. Have a shared_task_id");
        println!("  2. Have NO task_attempts");
        println!("  3. Another task with the SAME shared_task_id HAS attempts");
        return Ok(());
    }

    println!("=== Duplicate Tasks Cleanup Tool ===");
    println!();

    if !execute {
        println!("Running in DRY-RUN mode. No changes will be made.");
        println!("Use --execute to actually delete duplicates.");
        println!();
    }

    // Connect to database
    info!("Connecting to database...");
    let db = DBService::new().await?;
    let pool = &db.pool;

    // Find duplicates (clear case: one has attempts, the other doesn't)
    info!("Searching for duplicate tasks...");
    let duplicates = find_duplicates(pool).await?;

    println!("Found {} clear duplicate(s) to remove:", duplicates.len());
    for task in &duplicates {
        print_task(
            &DuplicateTask {
                id: task.id,
                title: task.title.clone(),
                shared_task_id: task.shared_task_id,
                is_remote: task.is_remote,
                created_at: task.created_at,
            },
            verbose,
        );
    }
    println!();

    // Find orphaned duplicates (neither has attempts)
    let orphaned = find_orphaned_duplicates(pool).await?;
    let mut orphaned_to_delete: Vec<Uuid> = Vec::new();

    if !orphaned.is_empty() {
        println!("Found {} orphaned duplicate task(s) (neither has attempts):", orphaned.len());

        // Group by shared_task_id and decide which to keep
        let mut current_shared_id: Option<Uuid> = None;
        let mut current_group: Vec<&OrphanedDuplicate> = Vec::new();

        for task in &orphaned {
            if current_shared_id != Some(task.shared_task_id) {
                // Process previous group
                if current_group.len() > 1 {
                    // Keep the first one (is_remote=0 preferred, then oldest)
                    // The query already orders by is_remote ASC, created_at ASC
                    let to_keep = current_group[0];
                    println!("  Keeping: {} (is_remote={}, created={})", to_keep.title, to_keep.is_remote, to_keep.created_at);
                    for task_to_delete in &current_group[1..] {
                        println!("  Deleting: {} (is_remote={}, created={})", task_to_delete.title, task_to_delete.is_remote, task_to_delete.created_at);
                        orphaned_to_delete.push(task_to_delete.id);
                    }
                }
                current_shared_id = Some(task.shared_task_id);
                current_group = vec![task];
            } else {
                current_group.push(task);
            }
        }
        // Process last group
        if current_group.len() > 1 {
            let to_keep = current_group[0];
            println!("  Keeping: {} (is_remote={}, created={})", to_keep.title, to_keep.is_remote, to_keep.created_at);
            for task_to_delete in &current_group[1..] {
                println!("  Deleting: {} (is_remote={}, created={})", task_to_delete.title, task_to_delete.is_remote, task_to_delete.created_at);
                orphaned_to_delete.push(task_to_delete.id);
            }
        }
        println!();
    }

    let total_to_delete = duplicates.len() + orphaned_to_delete.len();

    if total_to_delete == 0 {
        println!("No duplicates found. Database is clean!");
        return Ok(());
    }

    println!("Total tasks to delete: {}", total_to_delete);
    println!();

    if !execute {
        println!("Dry-run complete. Run with --execute to delete these tasks.");
        return Ok(());
    }

    // Confirmation prompt
    print!("Are you sure you want to delete {} task(s)? [y/N] ", total_to_delete);
    io::stdout().flush()?;

    let mut input = String::new();
    io::stdin().read_line(&mut input)?;

    if !input.trim().eq_ignore_ascii_case("y") {
        println!("Aborted.");
        return Ok(());
    }

    // Perform deletion
    println!();
    println!("Deleting duplicate tasks...");

    let mut result = CleanupResult {
        duplicates_found: total_to_delete,
        deleted: 0,
        errors: 0,
    };

    // Delete clear duplicates
    for task in &duplicates {
        match delete_task(pool, task.id).await {
            Ok(()) => {
                info!(task_id = %task.id, title = %task.title, "Deleted duplicate task");
                result.deleted += 1;
            }
            Err(e) => {
                error!(task_id = %task.id, error = %e, "Failed to delete task");
                result.errors += 1;
            }
        }
    }

    // Delete orphaned duplicates
    for task_id in &orphaned_to_delete {
        match delete_task(pool, *task_id).await {
            Ok(()) => {
                info!(task_id = %task_id, "Deleted orphaned duplicate task");
                result.deleted += 1;
            }
            Err(e) => {
                error!(task_id = %task_id, error = %e, "Failed to delete task");
                result.errors += 1;
            }
        }
    }

    println!();
    println!("=== Cleanup Complete ===");
    println!("Duplicates found: {}", result.duplicates_found);
    println!("Deleted: {}", result.deleted);
    println!("Errors: {}", result.errors);

    if result.errors > 0 {
        warn!("Some tasks could not be deleted. Check logs for details.");
    }

    Ok(())
}
