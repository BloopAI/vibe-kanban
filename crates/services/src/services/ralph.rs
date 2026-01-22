use std::collections::HashMap;
use std::path::Path;

use git2::{Repository, Sort};
use regex::Regex;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;


#[derive(Debug, Error)]
pub enum RalphError {
    #[error("workspace path does not exist: {0}")]
    WorkspaceNotFound(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("prd.json not found in workspace")]
    PrdNotFound,
    #[error("failed to parse prd.json: {0}")]
    PrdParseError(String),
    #[error("git error: {0}")]
    Git(#[from] git2::Error),
    #[error(".ralph/prompt.md not found in repository. Create this file with Ralph agent instructions.")]
    PromptNotFound,
}

/// Represents a user story from the PRD
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RalphStory {
    pub id: String,
    pub title: String,
    pub passes: bool,
    /// Whether this story is currently being worked on (set by agent)
    #[serde(default)]
    pub in_progress: bool,
    /// Whether this story is a checkpoint (pauses auto-continue for review)
    #[serde(default)]
    pub checkpoint: bool,
}

/// PRD structure for parsing stories
#[derive(Debug, Deserialize)]
struct PrdFile {
    #[serde(rename = "userStories")]
    user_stories: Vec<PrdStory>,
}

#[derive(Debug, Deserialize)]
struct PrdStory {
    id: String,
    title: String,
    #[serde(default)]
    passes: bool,
    #[serde(default, rename = "inProgress")]
    in_progress: bool,
    #[serde(default)]
    checkpoint: bool,
}

/// Status information for a Ralph task
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RalphStatus {
    /// Total number of stories
    pub total_stories: usize,
    /// Number of completed stories (passes: true)
    pub completed_count: usize,
    /// The current story (first with passes: false), if any
    pub current_story: Option<RalphStory>,
    /// All stories with their status
    pub stories: Vec<RalphStory>,
    /// Whether any story has inProgress: true (agent is mid-work)
    pub has_in_progress: bool,
}

/// Commit information for a completed story
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct StoryCommit {
    /// Short commit hash (7 characters)
    pub commit_hash: String,
    /// Full commit hash
    pub full_hash: String,
    /// Commit message subject line
    pub message: String,
}

pub struct RalphService;

impl RalphService {
    /// Get the Ralph directory path for a given repo path.
    /// Returns `.ralph/` inside the repo (fixed location, not branch-specific).
    pub fn get_ralph_dir(repo_path: &Path) -> std::path::PathBuf {
        repo_path.join(".ralph")
    }

    /// Check if a repository has .ralph/prompt.md file.
    /// Returns Ok(()) if it exists, Err(PromptNotFound) if not.
    pub fn validate_prompt_exists(repo_path: &Path) -> Result<(), RalphError> {
        let prompt_path = repo_path.join(".ralph").join("prompt.md");
        if !prompt_path.exists() {
            return Err(RalphError::PromptNotFound);
        }
        Ok(())
    }

    /// Get the status of Ralph stories from a ralph directory's prd.json file.
    ///
    /// Takes the ralph_dir path (e.g., `.ralph/feature-branch/`) directly.
    ///
    /// Returns status information including total stories, completed count,
    /// current story (first with passes: false), and all stories.
    ///
    /// Handles missing or malformed prd.json gracefully by returning appropriate errors.
    pub fn get_status(ralph_dir: &Path) -> Result<RalphStatus, RalphError> {
        // Read prd.json from ralph directory
        let prd_path = ralph_dir.join("prd.json");
        if !prd_path.exists() {
            return Err(RalphError::PrdNotFound);
        }

        let prd_content = std::fs::read_to_string(&prd_path)?;
        let prd: PrdFile =
            serde_json::from_str(&prd_content).map_err(|e| RalphError::PrdParseError(e.to_string()))?;

        // Convert to RalphStory structs
        let stories: Vec<RalphStory> = prd
            .user_stories
            .into_iter()
            .map(|s| RalphStory {
                id: s.id,
                title: s.title,
                passes: s.passes,
                in_progress: s.in_progress,
                checkpoint: s.checkpoint,
            })
            .collect();

        let total_stories = stories.len();
        let completed_count = stories.iter().filter(|s| s.passes).count();
        let current_story = stories.iter().find(|s| !s.passes).cloned();
        let has_in_progress = stories.iter().any(|s| s.in_progress);

        Ok(RalphStatus {
            total_stories,
            completed_count,
            current_story,
            stories,
            has_in_progress,
        })
    }

    /// Get status by finding the ralph directory from repo path.
    /// Uses the fixed `.ralph/` directory location.
    pub fn get_status_from_repo(repo_path: &Path) -> Result<RalphStatus, RalphError> {
        let ralph_dir = Self::get_ralph_dir(repo_path);
        Self::get_status(&ralph_dir)
    }

    /// Get commit information for each completed story by parsing git history.
    ///
    /// Scans the repository's commit history for commits matching the pattern:
    /// `feat: [story-id]` or `feat: story-id -` in the commit message.
    ///
    /// Returns a HashMap mapping story IDs to their commit info.
    pub fn get_story_commits(workspace_path: &Path) -> Result<HashMap<String, StoryCommit>, RalphError> {
        if !workspace_path.exists() {
            return Err(RalphError::WorkspaceNotFound(
                workspace_path.display().to_string(),
            ));
        }

        // Try to open the repo - workspace might be a git repo or inside one
        let repo = Repository::discover(workspace_path)?;

        // Pattern to match "feat: US-001" or "feat: [US-001]" style commits
        // Captures the story ID (e.g., US-001)
        let pattern = Regex::new(r"^feat:\s*\[?([A-Z]+-\d+)\]?").unwrap();

        let mut story_commits: HashMap<String, StoryCommit> = HashMap::new();

        // Walk commits from HEAD, limit to last 500 commits
        let mut revwalk = repo.revwalk()?;
        revwalk.push_head()?;
        revwalk.set_sorting(Sort::TIME)?;

        for oid_result in revwalk.take(500) {
            let oid = oid_result?;
            let commit = repo.find_commit(oid)?;

            if let Some(message) = commit.summary() {
                if let Some(captures) = pattern.captures(message) {
                    if let Some(story_id_match) = captures.get(1) {
                        let story_id = story_id_match.as_str().to_string();

                        // Only keep the first (most recent) commit for each story
                        if !story_commits.contains_key(&story_id) {
                            let full_hash = oid.to_string();
                            let short_hash = full_hash.chars().take(7).collect();

                            story_commits.insert(
                                story_id,
                                StoryCommit {
                                    commit_hash: short_hash,
                                    full_hash,
                                    message: message.to_string(),
                                },
                            );
                        }
                    }
                }
            }
        }

        Ok(story_commits)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_validate_prompt_exists() {
        let dir = tempdir().unwrap();

        // Should fail without prompt.md
        let result = RalphService::validate_prompt_exists(dir.path());
        assert!(matches!(result, Err(RalphError::PromptNotFound)));

        // Create .ralph/prompt.md
        let ralph_base = dir.path().join(".ralph");
        std::fs::create_dir_all(&ralph_base).unwrap();
        std::fs::write(ralph_base.join("prompt.md"), "# Test prompt").unwrap();

        // Should succeed now
        let result = RalphService::validate_prompt_exists(dir.path());
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_ralph_dir() {
        let repo_path = Path::new("/some/repo");

        // Returns fixed .ralph/ path
        let dir = RalphService::get_ralph_dir(repo_path);
        assert_eq!(dir, Path::new("/some/repo/.ralph"));
    }

    #[test]
    fn test_get_status_returns_correct_counts() {
        let dir = tempdir().unwrap();
        // Create ralph dir structure (fixed .ralph/ path)
        let ralph_dir = dir.path().join(".ralph");
        std::fs::create_dir_all(&ralph_dir).unwrap();

        let prd = r#"{
            "project": "Test",
            "branchName": "test-branch",
            "userStories": [
                {"id": "US-001", "title": "First story", "passes": true},
                {"id": "US-002", "title": "Second story", "passes": true},
                {"id": "US-003", "title": "Third story", "passes": false},
                {"id": "US-004", "title": "Fourth story", "passes": false}
            ]
        }"#;
        std::fs::write(ralph_dir.join("prd.json"), prd).unwrap();

        let status = RalphService::get_status(&ralph_dir).unwrap();

        assert_eq!(status.total_stories, 4);
        assert_eq!(status.completed_count, 2);
        assert!(status.current_story.is_some());
        assert_eq!(status.current_story.unwrap().id, "US-003");
        assert_eq!(status.stories.len(), 4);
    }

    #[test]
    fn test_get_status_all_complete() {
        let dir = tempdir().unwrap();
        let ralph_dir = dir.path().join(".ralph");
        std::fs::create_dir_all(&ralph_dir).unwrap();

        let prd = r#"{
            "project": "Test",
            "branchName": "test",
            "userStories": [
                {"id": "US-001", "title": "First story", "passes": true},
                {"id": "US-002", "title": "Second story", "passes": true}
            ]
        }"#;
        std::fs::write(ralph_dir.join("prd.json"), prd).unwrap();

        let status = RalphService::get_status(&ralph_dir).unwrap();

        assert_eq!(status.total_stories, 2);
        assert_eq!(status.completed_count, 2);
        assert!(status.current_story.is_none());
    }

    #[test]
    fn test_get_status_missing_prd() {
        let dir = tempdir().unwrap();
        let ralph_dir = dir.path().join(".ralph");
        std::fs::create_dir_all(&ralph_dir).unwrap();

        let result = RalphService::get_status(&ralph_dir);
        assert!(matches!(result, Err(RalphError::PrdNotFound)));
    }

    #[test]
    fn test_get_status_malformed_prd() {
        let dir = tempdir().unwrap();
        let ralph_dir = dir.path().join(".ralph");
        std::fs::create_dir_all(&ralph_dir).unwrap();
        std::fs::write(ralph_dir.join("prd.json"), "not valid json").unwrap();

        let result = RalphService::get_status(&ralph_dir);
        assert!(matches!(result, Err(RalphError::PrdParseError(_))));
    }
}
