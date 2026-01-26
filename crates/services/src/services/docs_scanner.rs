//! Documentation scanner for workspace docs folder
//!
//! Scans the `docs/` folder in a workspace and builds a context string
//! to be included in coding agent prompts.

use std::path::Path;

use tokio::fs;
use tracing;

/// Maximum total size of docs content to include (in bytes)
const MAX_TOTAL_DOCS_SIZE: usize = 100_000; // ~100KB

/// Maximum size of a single document (in bytes)
const MAX_SINGLE_DOC_SIZE: usize = 50_000; // ~50KB

/// Supported document extensions
const SUPPORTED_EXTENSIONS: &[&str] = &["md", "txt", "rst"];

/// Priority order for documents (higher priority = earlier in list)
const PRIORITY_DOCS: &[&str] = &[
    "requirements",
    "prd",
    "spec",
    "design",
    "architecture",
    "api",
    "readme",
];

/// A scanned document with its content
#[derive(Debug, Clone)]
pub struct ScannedDoc {
    pub relative_path: String,
    pub content: String,
    pub priority: usize,
}

impl ScannedDoc {
    fn new(relative_path: String, content: String) -> Self {
        let priority = Self::calculate_priority(&relative_path);
        Self {
            relative_path,
            content,
            priority,
        }
    }

    fn calculate_priority(path: &str) -> usize {
        let lower_path = path.to_lowercase();
        for (i, keyword) in PRIORITY_DOCS.iter().enumerate() {
            if lower_path.contains(keyword) {
                return PRIORITY_DOCS.len() - i;
            }
        }
        0
    }
}

/// Scan the docs folder in a workspace and return a list of documents
pub async fn scan_docs_folder(workspace_path: &Path) -> Vec<ScannedDoc> {
    let docs_path = workspace_path.join("docs");

    if !docs_path.exists() {
        tracing::debug!("No docs folder found at {:?}", docs_path);
        return Vec::new();
    }

    let mut docs = Vec::new();
    let mut total_size: usize = 0;

    if let Err(e) = scan_directory_recursive(&docs_path, &docs_path, &mut docs, &mut total_size).await {
        tracing::warn!("Error scanning docs folder: {}", e);
    }

    // Sort by priority (highest first)
    docs.sort_by(|a, b| b.priority.cmp(&a.priority));

    tracing::info!(
        "Scanned {} docs from {:?} (total size: {} bytes)",
        docs.len(),
        docs_path,
        total_size
    );

    docs
}

async fn scan_directory_recursive(
    base_path: &Path,
    current_path: &Path,
    docs: &mut Vec<ScannedDoc>,
    total_size: &mut usize,
) -> Result<(), std::io::Error> {
    let mut entries = fs::read_dir(current_path).await?;

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();

        if path.is_dir() {
            // Skip hidden directories
            if path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with('.'))
                .unwrap_or(false)
            {
                continue;
            }
            Box::pin(scan_directory_recursive(base_path, &path, docs, total_size)).await?;
        } else if path.is_file() {
            // Check if we've exceeded total size
            if *total_size >= MAX_TOTAL_DOCS_SIZE {
                tracing::debug!("Reached max total docs size, stopping scan");
                break;
            }

            // Check extension
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase());

            if let Some(ext) = extension {
                if !SUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
                    continue;
                }
            } else {
                continue;
            }

            // Read file content
            match fs::read_to_string(&path).await {
                Ok(content) => {
                    let content_size = content.len();

                    // Skip if single file is too large
                    if content_size > MAX_SINGLE_DOC_SIZE {
                        tracing::debug!(
                            "Skipping {:?}: file too large ({} bytes)",
                            path,
                            content_size
                        );
                        continue;
                    }

                    // Skip if would exceed total size
                    if *total_size + content_size > MAX_TOTAL_DOCS_SIZE {
                        tracing::debug!(
                            "Skipping {:?}: would exceed total size limit",
                            path
                        );
                        continue;
                    }

                    let relative_path = path
                        .strip_prefix(base_path)
                        .unwrap_or(&path)
                        .to_string_lossy()
                        .to_string();

                    *total_size += content_size;
                    docs.push(ScannedDoc::new(relative_path, content));
                }
                Err(e) => {
                    tracing::debug!("Failed to read {:?}: {}", path, e);
                }
            }
        }
    }

    Ok(())
}

/// Build a context string from scanned documents
pub fn build_docs_context(docs: &[ScannedDoc]) -> Option<String> {
    if docs.is_empty() {
        return None;
    }

    let mut context = String::new();
    context.push_str("# Project Documentation\n\n");
    context.push_str("The following documentation files are available in the docs/ folder. ");
    context.push_str("Please review them for project context, requirements, and design decisions.\n\n");

    for doc in docs {
        context.push_str(&format!("## docs/{}\n\n", doc.relative_path));
        context.push_str(&doc.content);
        context.push_str("\n\n---\n\n");
    }

    Some(context)
}

/// Scan docs folder and build a context string for the coding agent prompt
pub async fn get_docs_context_for_workspace(workspace_path: &Path) -> Option<String> {
    let docs = scan_docs_folder(workspace_path).await;
    build_docs_context(&docs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_scan_empty_docs_folder() {
        let temp_dir = TempDir::new().unwrap();
        let docs_path = temp_dir.path().join("docs");
        fs::create_dir(&docs_path).await.unwrap();

        let docs = scan_docs_folder(temp_dir.path()).await;
        assert!(docs.is_empty());
    }

    #[tokio::test]
    async fn test_scan_with_markdown_files() {
        let temp_dir = TempDir::new().unwrap();
        let docs_path = temp_dir.path().join("docs");
        fs::create_dir(&docs_path).await.unwrap();

        fs::write(docs_path.join("requirements.md"), "# Requirements\n\nTest requirements")
            .await
            .unwrap();
        fs::write(docs_path.join("design.md"), "# Design\n\nTest design")
            .await
            .unwrap();

        let docs = scan_docs_folder(temp_dir.path()).await;
        assert_eq!(docs.len(), 2);

        // Requirements should be first (higher priority)
        assert!(docs[0].relative_path.contains("requirements"));
    }

    #[tokio::test]
    async fn test_no_docs_folder() {
        let temp_dir = TempDir::new().unwrap();
        let docs = scan_docs_folder(temp_dir.path()).await;
        assert!(docs.is_empty());
    }

    #[test]
    fn test_priority_calculation() {
        assert!(ScannedDoc::calculate_priority("requirements.md") > 0);
        assert!(ScannedDoc::calculate_priority("design.md") > 0);
        assert!(ScannedDoc::calculate_priority("random.md") == 0);

        // Requirements should have higher priority than design
        assert!(
            ScannedDoc::calculate_priority("requirements.md")
                > ScannedDoc::calculate_priority("design.md")
        );
    }

    #[test]
    fn test_build_docs_context_empty() {
        let docs: Vec<ScannedDoc> = vec![];
        assert!(build_docs_context(&docs).is_none());
    }

    #[test]
    fn test_build_docs_context_with_docs() {
        let docs = vec![ScannedDoc::new(
            "requirements.md".to_string(),
            "# Requirements\n\nTest content".to_string(),
        )];

        let context = build_docs_context(&docs).unwrap();
        assert!(context.contains("Project Documentation"));
        assert!(context.contains("docs/requirements.md"));
        assert!(context.contains("Test content"));
    }
}
