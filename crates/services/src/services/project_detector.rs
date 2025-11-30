use std::collections::HashMap;
use std::path::Path;

use anyhow::Result;
use db::models::project::{ConfidenceLevel, ProjectConfigField, ProjectConfigSuggestion};
use ignore::WalkBuilder;
use regex::Regex;
use serde_json::Value;

const MAX_FILE_SIZE: u64 = 1024 * 1024; // 1MB max file size to scan
const DOCUMENTATION_FILES: &[&str] = &[
    "README.md",
    "CLAUDE.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "DEVELOPMENT.md",
    "INSTALL.md",
    "GETTING_STARTED.md",
];

pub struct ProjectDetector;

impl ProjectDetector {
    /// Scan a repository and return configuration suggestions
    pub fn scan_repo(repo_path: &Path) -> Result<Vec<ProjectConfigSuggestion>> {
        let mut suggestions = HashMap::new();

        // Scan package.json
        if let Some(pkg_suggestions) = Self::scan_package_json(repo_path)? {
            for suggestion in pkg_suggestions {
                Self::add_suggestion(&mut suggestions, suggestion);
            }
        }

        // Scan Cargo.toml
        if let Some(cargo_suggestions) = Self::scan_cargo_toml(repo_path)? {
            for suggestion in cargo_suggestions {
                Self::add_suggestion(&mut suggestions, suggestion);
            }
        }

        // Scan documentation files
        for doc_file in DOCUMENTATION_FILES {
            let doc_path = repo_path.join(doc_file);
            if doc_path.exists() {
                if let Some(doc_suggestions) = Self::scan_markdown_file(&doc_path, doc_file)? {
                    for suggestion in doc_suggestions {
                        Self::add_suggestion(&mut suggestions, suggestion);
                    }
                }
            }
        }

        // Scan for .env template files
        if let Some(env_suggestions) = Self::scan_env_files(repo_path)? {
            for suggestion in env_suggestions {
                Self::add_suggestion(&mut suggestions, suggestion);
            }
        }

        // Convert HashMap to Vec and return
        Ok(suggestions.into_values().collect())
    }

    /// Add suggestion to map, prioritizing High confidence over Medium
    fn add_suggestion(
        map: &mut HashMap<String, ProjectConfigSuggestion>,
        suggestion: ProjectConfigSuggestion,
    ) {
        let key = format!("{:?}", suggestion.field);

        if let Some(existing) = map.get(&key) {
            // Only replace if new suggestion has higher confidence
            match (&existing.confidence, &suggestion.confidence) {
                (ConfidenceLevel::Medium, ConfidenceLevel::High) => {
                    map.insert(key, suggestion);
                }
                _ => {
                    // Keep existing
                }
            }
        } else {
            map.insert(key, suggestion);
        }
    }

    /// Scan package.json for script commands
    fn scan_package_json(repo_path: &Path) -> Result<Option<Vec<ProjectConfigSuggestion>>> {
        let package_json_path = repo_path.join("package.json");
        if !package_json_path.exists() {
            return Ok(None);
        }

        let content = std::fs::read_to_string(&package_json_path)?;
        let json: Value = serde_json::from_str(&content)?;

        let mut suggestions = Vec::new();

        if let Some(scripts) = json.get("scripts").and_then(|s| s.as_object()) {
            // Dev script: look for dev, start, serve
            if let Some(dev_cmd) = scripts
                .get("dev")
                .or_else(|| scripts.get("start"))
                .or_else(|| scripts.get("serve"))
            {
                if let Some(cmd) = dev_cmd.as_str() {
                    suggestions.push(ProjectConfigSuggestion {
                        field: ProjectConfigField::DevScript,
                        value: format!("npm run {}", Self::get_script_name(scripts, cmd)),
                        confidence: ConfidenceLevel::High,
                        source: "package.json".to_string(),
                    });
                }
            }

            // Setup script: look for install, postinstall, build, prepare
            if let Some(setup_cmd) = scripts
                .get("install")
                .or_else(|| scripts.get("postinstall"))
                .or_else(|| scripts.get("build"))
                .or_else(|| scripts.get("prepare"))
            {
                if let Some(_cmd) = setup_cmd.as_str() {
                    // For setup, we typically want npm install, not the script itself
                    suggestions.push(ProjectConfigSuggestion {
                        field: ProjectConfigField::SetupScript,
                        value: "npm install".to_string(),
                        confidence: ConfidenceLevel::High,
                        source: "package.json".to_string(),
                    });
                }
            } else {
                // If no specific setup script, still suggest npm install
                suggestions.push(ProjectConfigSuggestion {
                    field: ProjectConfigField::SetupScript,
                    value: "npm install".to_string(),
                    confidence: ConfidenceLevel::High,
                    source: "package.json".to_string(),
                });
            }

            // Cleanup script: look for test, lint, check, validate
            let cleanup_scripts: Vec<String> = scripts
                .iter()
                .filter_map(|(name, _)| {
                    if name.contains("test")
                        || name.contains("lint")
                        || name.contains("check")
                        || name == "validate"
                    {
                        Some(format!("npm run {}", name))
                    } else {
                        None
                    }
                })
                .collect();

            if !cleanup_scripts.is_empty() {
                suggestions.push(ProjectConfigSuggestion {
                    field: ProjectConfigField::CleanupScript,
                    value: cleanup_scripts.join(" && "),
                    confidence: ConfidenceLevel::High,
                    source: "package.json".to_string(),
                });
            }
        }

        Ok(Some(suggestions))
    }

    /// Helper to get script name from command
    fn get_script_name(scripts: &serde_json::Map<String, Value>, target_cmd: &str) -> String {
        for (name, value) in scripts {
            if let Some(cmd) = value.as_str() {
                if cmd == target_cmd {
                    return name.clone();
                }
            }
        }
        "dev".to_string()
    }

    /// Scan Cargo.toml for Rust project
    fn scan_cargo_toml(repo_path: &Path) -> Result<Option<Vec<ProjectConfigSuggestion>>> {
        let cargo_toml_path = repo_path.join("Cargo.toml");
        if !cargo_toml_path.exists() {
            return Ok(None);
        }

        let mut suggestions = Vec::new();

        suggestions.push(ProjectConfigSuggestion {
            field: ProjectConfigField::SetupScript,
            value: "cargo build".to_string(),
            confidence: ConfidenceLevel::High,
            source: "Cargo.toml".to_string(),
        });

        suggestions.push(ProjectConfigSuggestion {
            field: ProjectConfigField::DevScript,
            value: "cargo run".to_string(),
            confidence: ConfidenceLevel::High,
            source: "Cargo.toml".to_string(),
        });

        suggestions.push(ProjectConfigSuggestion {
            field: ProjectConfigField::CleanupScript,
            value: "cargo test && cargo clippy".to_string(),
            confidence: ConfidenceLevel::High,
            source: "Cargo.toml".to_string(),
        });

        Ok(Some(suggestions))
    }

    /// Scan markdown files for command patterns
    fn scan_markdown_file(
        file_path: &Path,
        file_name: &str,
    ) -> Result<Option<Vec<ProjectConfigSuggestion>>> {
        // Check file size
        let metadata = std::fs::metadata(file_path)?;
        if metadata.len() > MAX_FILE_SIZE {
            return Ok(None);
        }

        let content = std::fs::read_to_string(file_path)?;
        let mut suggestions = Vec::new();

        // Extract code blocks
        let code_blocks = Self::extract_code_blocks(&content);

        // Dev script patterns
        let dev_patterns = [
            r"(npm|pnpm|yarn)\s+run\s+dev\b",
            r"(npm|pnpm|yarn)\s+start\b",
            r"(npm|pnpm|yarn)\s+run\s+serve\b",
            r"cargo\s+run\b",
            r"make\s+dev\b",
            r"make\s+start\b",
        ];

        for pattern in &dev_patterns {
            let re = Regex::new(pattern)?;
            for block in &code_blocks {
                if let Some(captures) = re.captures(block) {
                    if let Some(matched) = captures.get(0) {
                        suggestions.push(ProjectConfigSuggestion {
                            field: ProjectConfigField::DevScript,
                            value: matched.as_str().to_string(),
                            confidence: ConfidenceLevel::Medium,
                            source: file_name.to_string(),
                        });
                        break;
                    }
                }
            }
        }

        // Setup script patterns
        let setup_patterns = [
            r"(npm|pnpm|yarn)\s+install\b",
            r"(npm|pnpm|yarn)\s+i\b",
            r"cargo\s+build\b",
            r"make\s+install\b",
            r"pip\s+install\s+-r\s+requirements\.txt",
        ];

        for pattern in &setup_patterns {
            let re = Regex::new(pattern)?;
            for block in &code_blocks {
                if let Some(captures) = re.captures(block) {
                    if let Some(matched) = captures.get(0) {
                        suggestions.push(ProjectConfigSuggestion {
                            field: ProjectConfigField::SetupScript,
                            value: matched.as_str().to_string(),
                            confidence: ConfidenceLevel::Medium,
                            source: file_name.to_string(),
                        });
                        break;
                    }
                }
            }
        }

        // Cleanup/test script patterns
        let test_patterns = [
            r"(npm|pnpm|yarn)\s+run\s+test\b",
            r"(npm|pnpm|yarn)\s+test\b",
            r"(npm|pnpm|yarn)\s+run\s+lint\b",
            r"cargo\s+test\b",
            r"cargo\s+clippy\b",
            r"make\s+test\b",
        ];

        for pattern in &test_patterns {
            let re = Regex::new(pattern)?;
            for block in &code_blocks {
                if let Some(captures) = re.captures(block) {
                    if let Some(matched) = captures.get(0) {
                        suggestions.push(ProjectConfigSuggestion {
                            field: ProjectConfigField::CleanupScript,
                            value: matched.as_str().to_string(),
                            confidence: ConfidenceLevel::Medium,
                            source: file_name.to_string(),
                        });
                        break;
                    }
                }
            }
        }

        Ok(if suggestions.is_empty() {
            None
        } else {
            Some(suggestions)
        })
    }

    /// Extract code blocks from markdown content
    fn extract_code_blocks(content: &str) -> Vec<String> {
        let mut blocks = Vec::new();
        let mut in_code_block = false;
        let mut current_block = String::new();

        for line in content.lines() {
            if line.trim().starts_with("```") {
                if in_code_block {
                    // End of code block
                    if !current_block.trim().is_empty() {
                        blocks.push(current_block.clone());
                    }
                    current_block.clear();
                    in_code_block = false;
                } else {
                    // Start of code block
                    in_code_block = true;
                }
            } else if in_code_block {
                current_block.push_str(line);
                current_block.push('\n');
            }
        }

        blocks
    }

    /// Scan for .env files and other config files (including gitignored ones)
    fn scan_env_files(repo_path: &Path) -> Result<Option<Vec<ProjectConfigSuggestion>>> {
        let mut env_files = Vec::new();

        // Scan with gitignore DISABLED to find actual .env files (which are usually gitignored)
        let walker = WalkBuilder::new(repo_path)
            .max_depth(Some(2))
            .hidden(false)
            .git_ignore(false) // Disable gitignore to find .env files
            .git_global(false)
            .git_exclude(false)
            .build();

        for entry in walker {
            let entry = entry?;
            if entry.file_type().map_or(false, |ft| ft.is_file()) {
                if let Some(file_name) = entry.file_name().to_str() {
                    // Skip node_modules, target, dist, build directories even with gitignore disabled
                    if let Some(parent) = entry.path().parent() {
                        let parent_name = parent.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        if parent_name == "node_modules"
                            || parent_name == "target"
                            || parent_name == "dist"
                            || parent_name == "build"
                            || parent_name == ".git"
                        {
                            continue;
                        }
                    }

                    // Priority 1: Actual .env files (usually gitignored)
                    if file_name == ".env"
                        || file_name == ".env.local"
                        || file_name == ".env.development"
                        || file_name == ".env.production"
                    {
                        if let Ok(rel_path) = entry.path().strip_prefix(repo_path) {
                            env_files.push(rel_path.to_string_lossy().to_string());
                        }
                    }
                    // Priority 2: Config files that might be gitignored
                    else if file_name.starts_with("config.local")
                        || file_name.starts_with("settings.local")
                    {
                        if let Ok(rel_path) = entry.path().strip_prefix(repo_path) {
                            env_files.push(rel_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        if env_files.is_empty() {
            return Ok(None);
        }

        let suggestions = vec![ProjectConfigSuggestion {
            field: ProjectConfigField::CopyFiles,
            value: env_files.join(", "),
            confidence: ConfidenceLevel::High,
            source: "filesystem scan".to_string(),
        }];

        Ok(Some(suggestions))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_code_blocks() {
        let markdown = r#"
# Installation

To install, run:

```bash
npm install
```

Then start the dev server:

```bash
npm run dev
```

Done!
"#;
        let blocks = ProjectDetector::extract_code_blocks(markdown);
        assert_eq!(blocks.len(), 2);
        assert!(blocks[0].contains("npm install"));
        assert!(blocks[1].contains("npm run dev"));
    }
}
