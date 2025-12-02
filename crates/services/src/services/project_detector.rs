use std::collections::HashMap;
use std::fs;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PackageManager {
    Npm,
    Pnpm,
    Yarn,
}

impl PackageManager {
    /// Detect the package manager from the repository by checking for lock files
    /// and packageManager field in package.json
    pub fn detect(repo_path: &Path) -> Self {
        // Check for lock files first (most reliable indicator of what's actually used)
        if repo_path.join("pnpm-lock.yaml").exists() {
            return Self::Pnpm;
        }
        if repo_path.join("yarn.lock").exists() {
            return Self::Yarn;
        }
        if repo_path.join("package-lock.json").exists() {
            return Self::Npm;
        }

        // Check packageManager field in package.json
        let package_json_path = repo_path.join("package.json");
        if package_json_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&package_json_path) {
                if let Ok(json) = serde_json::from_str::<Value>(&content) {
                    if let Some(pm) = json.get("packageManager").and_then(|v| v.as_str()) {
                        if pm.starts_with("pnpm") {
                            return Self::Pnpm;
                        }
                        if pm.starts_with("yarn") {
                            return Self::Yarn;
                        }
                    }
                }
            }
        }

        // Default to npm
        Self::Npm
    }

    /// Get the run command for this package manager (e.g., "pnpm run")
    pub fn run_command(&self) -> &'static str {
        match self {
            Self::Npm => "npm run",
            Self::Pnpm => "pnpm run",
            Self::Yarn => "yarn run",
        }
    }

    /// Get the install command for this package manager
    pub fn install_command(&self) -> &'static str {
        match self {
            Self::Npm => "npm install",
            Self::Pnpm => "pnpm install",
            Self::Yarn => "yarn install",
        }
    }
}

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
            if doc_path.exists()
                && let Some(doc_suggestions) = Self::scan_markdown_file(&doc_path, doc_file)?
            {
                for suggestion in doc_suggestions {
                    Self::add_suggestion(&mut suggestions, suggestion);
                }
            }
        }

        // Scan for .env template files
        if let Some(env_suggestions) = Self::scan_env_files(repo_path)? {
            for suggestion in env_suggestions {
                Self::add_suggestion(&mut suggestions, suggestion);
            }
        }

        // Scan for dev server network configuration
        if let Some(network_suggestions) = Self::scan_dev_network_config(repo_path)? {
            for suggestion in network_suggestions {
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

        // Detect package manager for this project
        let pm = PackageManager::detect(repo_path);
        let run_cmd = pm.run_command();
        let install_cmd = pm.install_command();

        let mut suggestions = Vec::new();

        if let Some(scripts) = json.get("scripts").and_then(|s| s.as_object()) {
            // Dev script: look for dev, start, serve
            if let Some(dev_cmd) = scripts
                .get("dev")
                .or_else(|| scripts.get("start"))
                .or_else(|| scripts.get("serve"))
                && let Some(cmd) = dev_cmd.as_str()
            {
                suggestions.push(ProjectConfigSuggestion {
                    field: ProjectConfigField::DevScript,
                    value: format!("{} {}", run_cmd, Self::get_script_name(scripts, cmd)),
                    confidence: ConfidenceLevel::High,
                    source: "package.json".to_string(),
                });
            }

            // Setup script: look for install, postinstall, build, prepare
            if let Some(setup_cmd) = scripts
                .get("install")
                .or_else(|| scripts.get("postinstall"))
                .or_else(|| scripts.get("build"))
                .or_else(|| scripts.get("prepare"))
            {
                if let Some(_cmd) = setup_cmd.as_str() {
                    // For setup, we typically want install, not the script itself
                    suggestions.push(ProjectConfigSuggestion {
                        field: ProjectConfigField::SetupScript,
                        value: install_cmd.to_string(),
                        confidence: ConfidenceLevel::High,
                        source: "package.json".to_string(),
                    });
                }
            } else {
                // If no specific setup script, still suggest install
                suggestions.push(ProjectConfigSuggestion {
                    field: ProjectConfigField::SetupScript,
                    value: install_cmd.to_string(),
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
                        Some(format!("{} {}", run_cmd, name))
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
            if let Some(cmd) = value.as_str()
                && cmd == target_cmd
            {
                return name.clone();
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

        let suggestions = vec![
            ProjectConfigSuggestion {
                field: ProjectConfigField::SetupScript,
                value: "cargo build".to_string(),
                confidence: ConfidenceLevel::High,
                source: "Cargo.toml".to_string(),
            },
            ProjectConfigSuggestion {
                field: ProjectConfigField::DevScript,
                value: "cargo run".to_string(),
                confidence: ConfidenceLevel::High,
                source: "Cargo.toml".to_string(),
            },
            ProjectConfigSuggestion {
                field: ProjectConfigField::CleanupScript,
                value: "cargo test && cargo clippy".to_string(),
                confidence: ConfidenceLevel::High,
                source: "Cargo.toml".to_string(),
            },
        ];

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
                if let Some(captures) = re.captures(block)
                    && let Some(matched) = captures.get(0)
                {
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
                if let Some(captures) = re.captures(block)
                    && let Some(matched) = captures.get(0)
                {
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
                if let Some(captures) = re.captures(block)
                    && let Some(matched) = captures.get(0)
                {
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
            if entry.file_type().is_some_and(|ft| ft.is_file())
                && let Some(file_name) = entry.file_name().to_str()
            {
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

                // Actual .env files and config.local files (usually gitignored)
                let is_env_file = file_name == ".env"
                    || file_name == ".env.local"
                    || file_name == ".env.development"
                    || file_name == ".env.production";
                let is_local_config = file_name.starts_with("config.local")
                    || file_name.starts_with("settings.local");

                if (is_env_file || is_local_config)
                    && let Ok(rel_path) = entry.path().strip_prefix(repo_path)
                {
                    env_files.push(rel_path.to_string_lossy().to_string());
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

    /// Scan for dev server network configuration hints
    fn scan_dev_network_config(repo_path: &Path) -> Result<Option<Vec<ProjectConfigSuggestion>>> {
        let mut suggestions = Vec::new();

        // Compile regex patterns once
        let port_regex = Regex::new(r"port:\s*(\d+)").ok();
        let env_port_regex = Regex::new(r"PORT=(\d+)").ok();

        // Check vite.config.ts/js for server.host
        for config_file in ["vite.config.ts", "vite.config.js", "vite.config.mjs"] {
            let config_path = repo_path.join(config_file);
            if config_path.exists()
                && let Ok(content) = fs::read_to_string(&config_path)
            {
                // Look for server.host configuration
                if content.contains("host:") && content.contains("0.0.0.0") {
                    suggestions.push(ProjectConfigSuggestion {
                        field: ProjectConfigField::DevHost,
                        value: "0.0.0.0".to_string(),
                        confidence: ConfidenceLevel::High,
                        source: config_file.to_string(),
                    });
                }

                // Look for port configuration
                if let Some(ref re) = port_regex
                    && let Some(port_match) = re.captures(&content)
                    && let Some(port) = port_match.get(1)
                {
                    suggestions.push(ProjectConfigSuggestion {
                        field: ProjectConfigField::DevPort,
                        value: port.as_str().to_string(),
                        confidence: ConfidenceLevel::High,
                        source: config_file.to_string(),
                    });
                }
            }
        }

        // Check .env files for HOST and PORT
        if let Some(env_files) = Self::scan_env_files(repo_path)? {
            for env_file in env_files {
                if env_file.field == ProjectConfigField::CopyFiles {
                    let env_path = repo_path.join(&env_file.value);
                    if env_path.exists()
                        && let Ok(content) = fs::read_to_string(&env_path)
                    {
                        // Look for HOST=0.0.0.0
                        if content.contains("HOST=0.0.0.0")
                            || content.contains("HOST=\"0.0.0.0\"")
                        {
                            suggestions.push(ProjectConfigSuggestion {
                                field: ProjectConfigField::DevHost,
                                value: "0.0.0.0".to_string(),
                                confidence: ConfidenceLevel::Medium,
                                source: env_file.value.clone(),
                            });
                        }

                        // Look for PORT=XXXX
                        if let Some(ref re) = env_port_regex
                            && let Some(port_match) = re.captures(&content)
                            && let Some(port) = port_match.get(1)
                        {
                            suggestions.push(ProjectConfigSuggestion {
                                field: ProjectConfigField::DevPort,
                                value: port.as_str().to_string(),
                                confidence: ConfidenceLevel::Medium,
                                source: env_file.value.clone(),
                            });
                        }
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

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

    #[test]
    fn test_extract_code_blocks_with_language() {
        let markdown = r#"
```javascript
console.log("hello");
```

```bash
cargo build
```
"#;
        let blocks = ProjectDetector::extract_code_blocks(markdown);
        assert_eq!(blocks.len(), 2);
        assert!(blocks[0].contains("console.log"));
        assert!(blocks[1].contains("cargo build"));
    }

    #[test]
    fn test_extract_code_blocks_empty() {
        let markdown = "# No code blocks here\nJust regular text.";
        let blocks = ProjectDetector::extract_code_blocks(markdown);
        assert_eq!(blocks.len(), 0);
    }

    #[test]
    fn test_scan_package_json_with_dev_script() {
        let temp_dir = TempDir::new().unwrap();
        let package_json = r#"{
  "name": "test-project",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest"
  }
}"#;
        fs::write(temp_dir.path().join("package.json"), package_json).unwrap();

        let suggestions = ProjectDetector::scan_package_json(temp_dir.path())
            .unwrap()
            .unwrap();

        // Should find dev script
        let dev_suggestion = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::DevScript));
        assert!(dev_suggestion.is_some());
        let dev = dev_suggestion.unwrap();
        assert_eq!(dev.value, "npm run dev");
        assert!(matches!(dev.confidence, ConfidenceLevel::High));
        assert_eq!(dev.source, "package.json");

        // Should find setup script (npm install)
        let setup_suggestion = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::SetupScript));
        assert!(setup_suggestion.is_some());
        let setup = setup_suggestion.unwrap();
        assert_eq!(setup.value, "npm install");
        assert!(matches!(setup.confidence, ConfidenceLevel::High));

        // Should find test script
        let cleanup_suggestion = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::CleanupScript));
        assert!(cleanup_suggestion.is_some());
        let cleanup = cleanup_suggestion.unwrap();
        assert!(cleanup.value.contains("npm run test"));
    }

    #[test]
    fn test_scan_package_json_with_start_script() {
        let temp_dir = TempDir::new().unwrap();
        let package_json = r#"{
  "name": "test-project",
  "scripts": {
    "start": "node index.js"
  }
}"#;
        fs::write(temp_dir.path().join("package.json"), package_json).unwrap();

        let suggestions = ProjectDetector::scan_package_json(temp_dir.path())
            .unwrap()
            .unwrap();

        // Should find start script as dev script
        let dev_suggestion = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::DevScript));
        assert!(dev_suggestion.is_some());
        assert_eq!(dev_suggestion.unwrap().value, "npm run start");
    }

    #[test]
    fn test_scan_package_json_missing_file() {
        let temp_dir = TempDir::new().unwrap();
        let result = ProjectDetector::scan_package_json(temp_dir.path()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_scan_cargo_toml() {
        let temp_dir = TempDir::new().unwrap();
        let cargo_toml = r#"[package]
name = "test-project"
version = "0.1.0"
"#;
        fs::write(temp_dir.path().join("Cargo.toml"), cargo_toml).unwrap();

        let suggestions = ProjectDetector::scan_cargo_toml(temp_dir.path())
            .unwrap()
            .unwrap();

        assert_eq!(suggestions.len(), 3);

        // Check setup script
        let setup = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::SetupScript));
        assert!(setup.is_some());
        assert_eq!(setup.unwrap().value, "cargo build");

        // Check dev script
        let dev = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::DevScript));
        assert!(dev.is_some());
        assert_eq!(dev.unwrap().value, "cargo run");

        // Check cleanup script
        let cleanup = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::CleanupScript));
        assert!(cleanup.is_some());
        assert_eq!(cleanup.unwrap().value, "cargo test && cargo clippy");

        // All should be high confidence
        for suggestion in &suggestions {
            assert!(matches!(suggestion.confidence, ConfidenceLevel::High));
            assert_eq!(suggestion.source, "Cargo.toml");
        }
    }

    #[test]
    fn test_scan_cargo_toml_missing_file() {
        let temp_dir = TempDir::new().unwrap();
        let result = ProjectDetector::scan_cargo_toml(temp_dir.path()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_scan_markdown_file_with_commands() {
        let temp_dir = TempDir::new().unwrap();
        let readme = r#"# My Project

## Development

Start the dev server:

```bash
npm run dev
```

## Setup

Install dependencies:

```bash
pnpm install
```

## Testing

Run tests:

```bash
npm run test
npm run lint
```
"#;
        let readme_path = temp_dir.path().join("README.md");
        fs::write(&readme_path, readme).unwrap();

        let suggestions = ProjectDetector::scan_markdown_file(&readme_path, "README.md")
            .unwrap()
            .unwrap();

        // Should find dev script
        let dev = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::DevScript));
        assert!(dev.is_some());
        assert_eq!(dev.unwrap().value, "npm run dev");
        assert!(matches!(dev.unwrap().confidence, ConfidenceLevel::Medium));

        // Should find setup script
        let setup = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::SetupScript));
        assert!(setup.is_some());
        assert_eq!(setup.unwrap().value, "pnpm install");

        // Should find test script
        let cleanup = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::CleanupScript));
        assert!(cleanup.is_some());
        assert!(cleanup.unwrap().value.contains("npm run test"));
    }

    #[test]
    fn test_scan_markdown_file_with_cargo_commands() {
        let temp_dir = TempDir::new().unwrap();
        let readme = r#"# Rust Project

Build with:

```bash
cargo build
```

Run with:

```bash
cargo run
```

Test with:

```bash
cargo test
```
"#;
        let readme_path = temp_dir.path().join("README.md");
        fs::write(&readme_path, readme).unwrap();

        let suggestions = ProjectDetector::scan_markdown_file(&readme_path, "README.md")
            .unwrap()
            .unwrap();

        assert!(suggestions
            .iter()
            .any(|s| matches!(s.field, ProjectConfigField::DevScript) && s.value == "cargo run"));
        assert!(suggestions.iter().any(
            |s| matches!(s.field, ProjectConfigField::SetupScript) && s.value == "cargo build"
        ));
        assert!(suggestions.iter().any(
            |s| matches!(s.field, ProjectConfigField::CleanupScript) && s.value == "cargo test"
        ));
    }

    #[test]
    fn test_scan_markdown_file_no_commands() {
        let temp_dir = TempDir::new().unwrap();
        let readme = "# My Project\n\nThis is a simple project with no code blocks.";
        let readme_path = temp_dir.path().join("README.md");
        fs::write(&readme_path, readme).unwrap();

        let result = ProjectDetector::scan_markdown_file(&readme_path, "README.md").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_scan_env_files() {
        let temp_dir = TempDir::new().unwrap();

        // Create .env file (typically gitignored)
        fs::write(temp_dir.path().join(".env"), "API_KEY=secret").unwrap();

        // Create .env.local
        fs::write(temp_dir.path().join(".env.local"), "DEBUG=true").unwrap();

        // Create .gitignore that ignores .env files
        fs::write(temp_dir.path().join(".gitignore"), ".env\n.env.local").unwrap();

        let suggestions = ProjectDetector::scan_env_files(temp_dir.path())
            .unwrap()
            .unwrap();

        assert_eq!(suggestions.len(), 1);
        let copy_files = &suggestions[0];
        assert!(matches!(copy_files.field, ProjectConfigField::CopyFiles));
        assert!(matches!(copy_files.confidence, ConfidenceLevel::High));
        assert_eq!(copy_files.source, "filesystem scan");

        // Should find both .env files even though they're gitignored
        assert!(copy_files.value.contains(".env"));
        assert!(copy_files.value.contains(".env.local"));
    }

    #[test]
    fn test_scan_env_files_none_found() {
        let temp_dir = TempDir::new().unwrap();
        let result = ProjectDetector::scan_env_files(temp_dir.path()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_add_suggestion_prioritizes_high_confidence() {
        let mut map = HashMap::new();

        // Add medium confidence suggestion first
        let medium_suggestion = ProjectConfigSuggestion {
            field: ProjectConfigField::DevScript,
            value: "npm run dev".to_string(),
            confidence: ConfidenceLevel::Medium,
            source: "README.md".to_string(),
        };
        ProjectDetector::add_suggestion(&mut map, medium_suggestion);

        assert_eq!(map.len(), 1);
        let key = "DevScript".to_string();
        assert!(matches!(
            map.get(&key).unwrap().confidence,
            ConfidenceLevel::Medium
        ));

        // Add high confidence suggestion - should replace medium
        let high_suggestion = ProjectConfigSuggestion {
            field: ProjectConfigField::DevScript,
            value: "npm run start".to_string(),
            confidence: ConfidenceLevel::High,
            source: "package.json".to_string(),
        };
        ProjectDetector::add_suggestion(&mut map, high_suggestion);

        assert_eq!(map.len(), 1);
        let stored = map.get(&key).unwrap();
        assert!(matches!(stored.confidence, ConfidenceLevel::High));
        assert_eq!(stored.value, "npm run start");
        assert_eq!(stored.source, "package.json");
    }

    #[test]
    fn test_add_suggestion_keeps_high_confidence() {
        let mut map = HashMap::new();

        // Add high confidence suggestion first
        let high_suggestion = ProjectConfigSuggestion {
            field: ProjectConfigField::DevScript,
            value: "npm run dev".to_string(),
            confidence: ConfidenceLevel::High,
            source: "package.json".to_string(),
        };
        ProjectDetector::add_suggestion(&mut map, high_suggestion);

        // Try to add medium confidence - should be ignored
        let medium_suggestion = ProjectConfigSuggestion {
            field: ProjectConfigField::DevScript,
            value: "npm start".to_string(),
            confidence: ConfidenceLevel::Medium,
            source: "README.md".to_string(),
        };
        ProjectDetector::add_suggestion(&mut map, medium_suggestion);

        let key = "DevScript".to_string();
        let stored = map.get(&key).unwrap();
        assert!(matches!(stored.confidence, ConfidenceLevel::High));
        assert_eq!(stored.value, "npm run dev");
        assert_eq!(stored.source, "package.json");
    }

    #[test]
    fn test_scan_repo_hybrid_project() {
        let temp_dir = TempDir::new().unwrap();

        // Create a hybrid Node.js + Rust project
        let package_json = r#"{
  "name": "hybrid-project",
  "scripts": {
    "dev": "vite",
    "test": "vitest",
    "lint": "eslint ."
  }
}"#;
        fs::write(temp_dir.path().join("package.json"), package_json).unwrap();

        let cargo_toml = r#"[package]
name = "hybrid-project"
version = "0.1.0"
"#;
        fs::write(temp_dir.path().join("Cargo.toml"), cargo_toml).unwrap();

        fs::write(temp_dir.path().join(".env"), "API_KEY=test").unwrap();

        let readme = r#"# Hybrid Project

Start development:

```bash
pnpm run dev
```
"#;
        fs::write(temp_dir.path().join("README.md"), readme).unwrap();

        let suggestions = ProjectDetector::scan_repo(temp_dir.path()).unwrap();

        // Should have suggestions from both package.json and Cargo.toml
        // Package.json should win for dev script (High confidence, processed first)
        let dev = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::DevScript));
        assert!(dev.is_some());
        assert_eq!(dev.unwrap().source, "package.json");

        // Should find .env file
        let copy_files = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::CopyFiles));
        assert!(copy_files.is_some());
        assert!(copy_files.unwrap().value.contains(".env"));
    }

    #[test]
    fn test_package_manager_detect_pnpm_lockfile() {
        let temp_dir = TempDir::new().unwrap();
        fs::write(temp_dir.path().join("pnpm-lock.yaml"), "lockfileVersion: 5.4").unwrap();
        fs::write(temp_dir.path().join("package.json"), "{}").unwrap();

        let pm = PackageManager::detect(temp_dir.path());
        assert_eq!(pm, PackageManager::Pnpm);
        assert_eq!(pm.run_command(), "pnpm run");
        assert_eq!(pm.install_command(), "pnpm install");
    }

    #[test]
    fn test_package_manager_detect_yarn_lockfile() {
        let temp_dir = TempDir::new().unwrap();
        fs::write(temp_dir.path().join("yarn.lock"), "# yarn lockfile v1").unwrap();
        fs::write(temp_dir.path().join("package.json"), "{}").unwrap();

        let pm = PackageManager::detect(temp_dir.path());
        assert_eq!(pm, PackageManager::Yarn);
        assert_eq!(pm.run_command(), "yarn run");
        assert_eq!(pm.install_command(), "yarn install");
    }

    #[test]
    fn test_package_manager_detect_npm_lockfile() {
        let temp_dir = TempDir::new().unwrap();
        fs::write(temp_dir.path().join("package-lock.json"), "{}").unwrap();
        fs::write(temp_dir.path().join("package.json"), "{}").unwrap();

        let pm = PackageManager::detect(temp_dir.path());
        assert_eq!(pm, PackageManager::Npm);
        assert_eq!(pm.run_command(), "npm run");
        assert_eq!(pm.install_command(), "npm install");
    }

    #[test]
    fn test_package_manager_detect_from_package_json() {
        let temp_dir = TempDir::new().unwrap();
        let package_json = r#"{"packageManager": "pnpm@8.0.0"}"#;
        fs::write(temp_dir.path().join("package.json"), package_json).unwrap();

        let pm = PackageManager::detect(temp_dir.path());
        assert_eq!(pm, PackageManager::Pnpm);
    }

    #[test]
    fn test_package_manager_detect_default_npm() {
        let temp_dir = TempDir::new().unwrap();
        fs::write(temp_dir.path().join("package.json"), "{}").unwrap();

        let pm = PackageManager::detect(temp_dir.path());
        assert_eq!(pm, PackageManager::Npm);
    }

    #[test]
    fn test_scan_package_json_with_pnpm() {
        let temp_dir = TempDir::new().unwrap();

        // Create pnpm lock file to trigger pnpm detection
        fs::write(temp_dir.path().join("pnpm-lock.yaml"), "lockfileVersion: 5.4").unwrap();

        let package_json = r#"{
  "name": "test-project",
  "scripts": {
    "dev": "vite",
    "test": "vitest"
  }
}"#;
        fs::write(temp_dir.path().join("package.json"), package_json).unwrap();

        let suggestions = ProjectDetector::scan_package_json(temp_dir.path())
            .unwrap()
            .unwrap();

        // Should use pnpm commands
        let dev = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::DevScript))
            .unwrap();
        assert_eq!(dev.value, "pnpm run dev");

        let setup = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::SetupScript))
            .unwrap();
        assert_eq!(setup.value, "pnpm install");

        let cleanup = suggestions
            .iter()
            .find(|s| matches!(s.field, ProjectConfigField::CleanupScript))
            .unwrap();
        assert!(cleanup.value.contains("pnpm run test"));
    }
}
