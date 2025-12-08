//! CLI tool to clean up duplicate tasks created by the swarm sync issue.
//!
//! Duplicates are identified as tasks that:
//! 1. Have the same TITLE as another task
//! 2. Have NO task_attempts
//! 3. Another task with the SAME TITLE DOES have attempts
//!
//! Usage:
//!   cargo run --bin cleanup_duplicate_tasks -- --dry-run  # Dry-run (default)
//!   cargo run --bin cleanup_duplicate_tasks -- --execute  # Actually delete
//!   cargo run --bin cleanup_duplicate_tasks -- --verbose  # Show details

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
    is_remote: bool,
    created_at: DateTime<Utc>,
}

struct CleanupResult {
    duplicates_found: usize,
    deleted: usize,
    errors: usize,
}

/// Find duplicate tasks by TITLE: tasks that have no attempts,
/// where another task with the same TITLE DOES have attempts.
async fn find_duplicates_by_title(pool: &SqlitePool) -> Result<Vec<DuplicateTask>, sqlx::Error> {
    sqlx::query_as::<_, DuplicateTask>(
        r#"
        SELECT
            t.id as "id: Uuid",
            t.title,
            t.is_remote as "is_remote: bool",
            t.created_at as "created_at: DateTime<Utc>"
        FROM tasks t
        WHERE NOT EXISTS (SELECT 1 FROM task_attempts ta WHERE ta.task_id = t.id)
          AND EXISTS (
              SELECT 1 FROM tasks t2
              WHERE t2.title = t.title
                AND t2.id != t.id
                AND EXISTS (SELECT 1 FROM task_attempts ta2 WHERE ta2.task_id = t2.id)
          )
        ORDER BY t.title, t.created_at
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
            "  - ID: {}\n    Title: {}\n    IsRemote: {}\n    Created: {}",
            task.id, task.title, task.is_remote, task.created_at
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
        println!("  cargo run --bin cleanup_duplicate_tasks              Dry-run mode (default)");
        println!("  cargo run --bin cleanup_duplicate_tasks -- --execute Actually delete duplicates");
        println!("  cargo run --bin cleanup_duplicate_tasks -- --verbose Show detailed task info");
        println!("  cargo run --bin cleanup_duplicate_tasks -- --help    Show this help");
        println!();
        println!("Duplicates are tasks that:");
        println!("  1. Have the same TITLE as another task");
        println!("  2. Have NO task_attempts");
        println!("  3. Another task with the SAME TITLE HAS attempts");
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

    // Find duplicates by title (tasks with no attempts where another task with same title HAS attempts)
    info!("Searching for duplicate tasks by title...");
    let duplicates = find_duplicates_by_title(pool).await?;

    println!("Found {} duplicate(s) to remove:", duplicates.len());
    for task in &duplicates {
        print_task(task, verbose);
    }
    println!();

    let total_to_delete = duplicates.len();

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

    // Delete duplicates
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
