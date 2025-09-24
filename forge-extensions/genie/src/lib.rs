//! Forge Genie Extension
//!
//! Provides Genie wish and automation management functionality for the Forge application.
//! Handles wish files, metadata, and command tracking.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenieWish {
    pub title: String,
    pub status: String,
    pub file_path: String,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenieCommand {
    pub name: String,
    pub description: String,
    pub command: String,
}

#[derive(Debug, Clone)]
pub struct GenieService {
    wishes_dir: String,
}

impl GenieService {
    pub fn new(wishes_dir: String) -> Self {
        Self { wishes_dir }
    }

    pub async fn list_wishes(&self) -> Result<Vec<GenieWish>> {
        let mut wishes = Vec::new();

        if let Ok(entries) = std::fs::read_dir(&self.wishes_dir) {
            for entry in entries.flatten() {
                if let Some(path) = entry.path().to_str() {
                    if path.ends_with(".md") {
                        if let Ok(content) = std::fs::read_to_string(&entry.path()) {
                            let wish = self.parse_wish_content(&content, path)?;
                            wishes.push(wish);
                        }
                    }
                }
            }
        }

        Ok(wishes)
    }

    pub async fn get_wish(&self, title: &str) -> Result<Option<GenieWish>> {
        let wishes = self.list_wishes().await?;
        Ok(wishes.into_iter().find(|w| w.title.contains(title)))
    }

    pub async fn list_commands(&self) -> Result<Vec<GenieCommand>> {
        // Return some default commands for demonstration
        Ok(vec![
            GenieCommand {
                name: "wish".to_string(),
                description: "Create or work on a development wish".to_string(),
                command: "/wish".to_string(),
            },
            GenieCommand {
                name: "analyze".to_string(),
                description: "Analyze codebase structure and patterns".to_string(),
                command: "/analyze".to_string(),
            },
        ])
    }

    fn parse_wish_content(&self, content: &str, file_path: &str) -> Result<GenieWish> {
        let lines: Vec<&str> = content.lines().collect();
        let title = lines
            .iter()
            .find(|line| line.starts_with("# "))
            .map(|line| line.trim_start_matches("# ").to_string())
            .unwrap_or_else(|| "Untitled Wish".to_string());

        let status = lines
            .iter()
            .find(|line| line.contains("**Status:**"))
            .and_then(|line| line.split("**Status:**").nth(1))
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "UNKNOWN".to_string());

        let summary = lines
            .iter()
            .find(|line| line.contains("## Executive Summary"))
            .and_then(|_| {
                lines
                    .iter()
                    .skip_while(|line| !line.contains("## Executive Summary"))
                    .skip(1)
                    .take_while(|line| !line.starts_with("##"))
                    .find(|line| !line.trim().is_empty())
            })
            .map(|s| s.trim().to_string());

        Ok(GenieWish {
            title,
            status,
            file_path: file_path.to_string(),
            summary,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_genie_service_creation() {
        let service = GenieService::new("./test_wishes".to_string());
        assert_eq!(service.wishes_dir, "./test_wishes");
    }

    #[test]
    fn test_parse_wish_content() {
        let service = GenieService::new("./test".to_string());
        let content = "# Test Wish\n\n**Status:** APPROVED\n\n## Executive Summary\nThis is a test wish\n";
        let wish = service.parse_wish_content(content, "test.md").unwrap();

        assert_eq!(wish.title, "Test Wish");
        assert_eq!(wish.status, "APPROVED");
        assert_eq!(wish.summary, Some("This is a test wish".to_string()));
    }
}
