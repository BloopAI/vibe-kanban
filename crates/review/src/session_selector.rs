use std::{path::PathBuf, time::SystemTime};

use dialoguer::{Select, theme::ColorfulTheme};
use tracing::debug;

use crate::{
    claude_session::{
        ClaudeProject, discover_projects, discover_sessions, find_projects_by_branch,
    },
    error::ReviewError,
};

/// Result of session selection process
pub enum SessionSelection {
    /// User selected session files to include (all sessions from a project)
    Selected(Vec<PathBuf>),
    /// User chose to skip session attachment
    Skipped,
}

/// Prompt user to select a Claude Code project
///
/// Flow:
/// 1. Try auto-match by branch name
/// 2. If match found, confirm with user
/// 3. If no match or user declines, show scrollable project list
/// 4. Allow user to skip entirely
///
/// When a project is selected, ALL sessions from that project are included.
pub fn select_session(pr_branch: &str) -> Result<SessionSelection, ReviewError> {
    debug!(
        "Looking for Claude Code projects matching branch: {}",
        pr_branch
    );

    let projects = discover_projects()?;

    if projects.is_empty() {
        debug!("No Claude Code projects found");
        return Ok(SessionSelection::Skipped);
    }

    // Try auto-match by branch
    let matches = find_projects_by_branch(&projects, pr_branch)?;

    if !matches.is_empty() {
        // Found a matching project, ask for confirmation
        let (project, sessions) = &matches[0];

        println!();
        println!();
        println!(
            "Found matching Claude Code project for branch '{}'",
            pr_branch
        );
        println!("  Project: {}", project.name);
        if let Some(ref prompt) = project.first_prompt {
            println!("  \"{}\"", prompt);
        }
        println!(
            "  {} session{} · Last modified: {}",
            project.session_count,
            if project.session_count == 1 { "" } else { "s" },
            format_time_ago(project.modified_at)
        );
        println!();

        let selection = Select::with_theme(&ColorfulTheme::default())
            .with_prompt("Use this project to improve review quality?")
            .items(&[
                "Yes, use this project",
                "No, choose a different project",
                "Skip (generate review from just code changes)",
            ])
            .default(0)
            .interact()
            .map_err(|e| ReviewError::SessionDiscoveryFailed(e.to_string()))?;

        match selection {
            0 => {
                // Yes, use all sessions from this project
                let paths: Vec<PathBuf> = sessions.iter().map(|s| s.path.clone()).collect();
                return Ok(SessionSelection::Selected(paths));
            }
            2 => {
                // Skip
                return Ok(SessionSelection::Skipped);
            }
            _ => {
                // Fall through to manual selection
            }
        }
    }

    // Manual selection: select a project
    select_project(&projects)
}

/// Manual project selection - returns all sessions from selected project
fn select_project(projects: &[ClaudeProject]) -> Result<SessionSelection, ReviewError> {
    // Build project list with rich metadata
    let mut items: Vec<String> = Vec::new();
    items.push("Skip (no project)\n".to_string());
    items.extend(projects.iter().map(format_project_item));
    items.push("Skip (no project)\n".to_string());

    println!();
    println!();
    let selection = Select::with_theme(&ColorfulTheme::default())
        .with_prompt("Select a Claude Code project to improve review quality")
        .items(&items)
        .default(0)
        .max_length(5)
        .interact()
        .map_err(|e| ReviewError::SessionDiscoveryFailed(e.to_string()))?;

    // Skip option
    if selection == 0 || selection == items.len() - 1 {
        return Ok(SessionSelection::Skipped);
    }

    let project = &projects[selection];
    let sessions = discover_sessions(project)?;

    // Return all session paths from this project
    let paths: Vec<PathBuf> = sessions.iter().map(|s| s.path.clone()).collect();
    Ok(SessionSelection::Selected(paths))
}

/// Format a project item for display in the selection list
fn format_project_item(project: &ClaudeProject) -> String {
    let prompt_line = project
        .first_prompt
        .as_ref()
        .map(|p| format!("\n  \"{}\"", p))
        .unwrap_or_default();

    let branch = project
        .git_branch
        .as_ref()
        .map(|b| format!("branch: {}", b))
        .unwrap_or_else(|| "no branch".to_string());

    format!(
        "{}{}\n  {} · {} session{} · {}\n",
        project.name,
        prompt_line,
        branch,
        project.session_count,
        if project.session_count == 1 { "" } else { "s" },
        format_time_ago(project.modified_at)
    )
}

/// Format a SystemTime as a human-readable "time ago" string
fn format_time_ago(time: SystemTime) -> String {
    let now = SystemTime::now();
    let duration = now.duration_since(time).unwrap_or_default();
    let secs = duration.as_secs();

    if secs < 60 {
        "just now".to_string()
    } else if secs < 3600 {
        let mins = secs / 60;
        format!("{} minute{} ago", mins, if mins == 1 { "" } else { "s" })
    } else if secs < 86400 {
        let hours = secs / 3600;
        format!("{} hour{} ago", hours, if hours == 1 { "" } else { "s" })
    } else {
        let days = secs / 86400;
        format!("{} day{} ago", days, if days == 1 { "" } else { "s" })
    }
}
