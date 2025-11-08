use std::path::{Path, PathBuf};
use serde::Deserialize;
use db::models::commands::{SlashCommand, InternalSlashCommand, CommandCategory};

#[derive(Debug, Deserialize, Default)]
struct FrontMatter {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub examples: Option<Vec<String>>,
}

pub struct SlashCommandService;

impl SlashCommandService {
    pub fn new() -> Self {
        Self
    }

    /// Generate a unique, collision-resistant command ID based on the file path
    fn generate_command_id(source_path: &Path) -> String {
        use std::hash::{Hash, Hasher};
        use std::collections::hash_map::DefaultHasher;

        let mut hasher = DefaultHasher::new();
        source_path.hash(&mut hasher);
        format!("cmd-{:x}", hasher.finish())
    }

    pub async fn get_commands(&self) -> Result<Vec<SlashCommand>, std::io::Error> {
        let (global_path, project_path) = Self::get_default_paths().await?;
        let mut internal_commands = Vec::new();

        tracing::info!("Scanning for slash commands - global: {:?}, project: {:?}", global_path, project_path);

        // Scan global commands directory recursively
        if global_path.exists() {
            tracing::info!("Scanning global commands directory: {}", global_path.display());
            internal_commands.extend(self.scan_directory_recursive(&global_path, &global_path, CommandCategory::Global).await?);
        }

        // Scan project commands directory recursively
        if project_path.exists() && project_path != global_path {
            tracing::info!("Scanning project commands directory: {}", project_path.display());
            internal_commands.extend(self.scan_directory_recursive(&project_path, &project_path, CommandCategory::Project).await?);
        }

        // Sort commands by name
        internal_commands.sort_by(|a, b| a.name.cmp(&b.name));

        // Convert to public SlashCommand (without source field)
        let commands: Vec<SlashCommand> = internal_commands.into_iter().map(Into::into).collect();

        tracing::info!("Found {} total commands", commands.len());
        Ok(commands)
    }

    async fn scan_directory_recursive(&self, dir_path: &Path, base_path: &Path, category: CommandCategory) -> Result<Vec<InternalSlashCommand>, std::io::Error> {
        let mut commands = Vec::new();
        tracing::info!("Scanning directory: {}", dir_path.display());

        let walker = walkdir::WalkDir::new(dir_path);

        for entry in walker.into_iter() {
            match entry {
                Ok(entry) if entry.file_type().is_file() => {
                    let path = entry.path();

                    if self.is_command_file(&path) {
                        // Calculate namespace relative to base path
                        let namespace = path.parent()
                            .and_then(|p| p.strip_prefix(base_path).ok())
                            .and_then(|p| p.to_str())
                            .filter(|s| !s.is_empty());

                        match self.parse_command_file(&path, namespace, category).await {
                            Ok(command) => {
                                tracing::info!("Successfully parsed command: {} (namespace: {:?})", command.name, namespace);
                                commands.push(command);
                            },
                            Err(e) => {
                                tracing::warn!("Failed to parse command file {}: {}", path.display(), e);
                            }
                        }
                    } else {
                        tracing::debug!("Skipping non-command file: {}", path.display());
                    }
                }
                Ok(_) => {
                    // Directory or other file type - continue walking (walkdir handles this automatically)
                }
                Err(e) => {
                    tracing::warn!("Error walking directory: {}", e);
                }
            }
        }

        tracing::info!("Found {} commands in {}", commands.len(), dir_path.display());
        Ok(commands)
    }

    async fn parse_command_file(&self, path: &Path, namespace: Option<&str>, category: CommandCategory) -> Result<InternalSlashCommand, std::io::Error> {
        // Basic security check
        if !path.exists() || !path.is_file() {
            return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "Command file not found"));
        }

        // Validate path for security
        validate_command_path(path)?;

        // Read file content
        let content = tokio::fs::read_to_string(path).await?;

        // Parse frontmatter
        let matter = gray_matter::Matter::<gray_matter::engine::YAML>::new();
        let parsed = matter.parse(&content);
        let frontmatter: FrontMatter = if let Some(data) = parsed.data {
            data.deserialize()
                .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidData, "Failed to parse frontmatter"))?
        } else {
            FrontMatter::default()
        };

        // Extract filename as fallback name
        let filename = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");

        // Create command name with namespace prefix
        let name = if let Some(ns) = namespace {
            format!("/{}:{}", ns, filename)
        } else {
            format!("/{}", filename)
        };

        // Use frontmatter name if provided, but add namespace prefix if needed
        let name = if let Some(frontmatter_name) = frontmatter.name {
            if let Some(ns) = namespace {
                // Check if frontmatter name already starts with namespace
                if frontmatter_name.starts_with(&format!("/{}:", ns)) {
                    frontmatter_name
                } else {
                    format!("/{}:{}", ns, frontmatter_name.trim_start_matches('/'))
                }
            } else {
                frontmatter_name
            }
        } else {
            name
        };

        // Create simple description without namespace info (since it's in the name now)
        let description = frontmatter.description.unwrap_or_else(|| "No description".to_string());

        // Generate unique ID based on file path to prevent collisions
        let id = Self::generate_command_id(path);

        Ok(InternalSlashCommand {
            id,
            name,
            description,
            category,
            examples: frontmatter.examples,
            source: path.to_string_lossy().to_string(),
            namespace: namespace.map(|s| s.to_string()),
        })
    }

    fn is_command_file(&self, path: &Path) -> bool {
        if let Some(extension) = path.extension() {
            matches!(extension.to_str(), Some("md") | Some("txt") | Some("sh"))
        } else {
            false
        }
    }

    async fn get_default_paths() -> Result<(PathBuf, PathBuf), std::io::Error> {
        let home_dir = dirs::home_dir()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Home directory not found"))?;
        let global_commands_path = home_dir.join(".claude/commands");

        let project_root = std::env::current_dir()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to get current directory: {}", e)))?;
        let project_commands_path = project_root.join(".claude/commands");

        Ok((global_commands_path, project_commands_path))
    }
}

// Secure validation using path canonicalization
fn validate_command_path(path: &Path) -> Result<(), std::io::Error> {
    // Get canonical absolute path (resolves symlinks, relative paths, etc.)
    let canonical_path = path.canonicalize()
        .map_err(|_| std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "Invalid command path"
        ))?;

    // Define allowed base paths with proper error handling
    let home_dir = dirs::home_dir()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "Home directory not found"))?;
    let current_dir = std::env::current_dir()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, format!("Failed to get current directory: {}", e)))?;

    let allowed_paths = [
        home_dir.join(".claude/commands"),
        current_dir.join(".claude/commands"),
    ];

    // Check if canonical path is within allowed paths
    if !allowed_paths.iter().any(|base| canonical_path.starts_with(base)) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "Access denied: path outside of allowed command directories"
        ));
    }

    Ok(())
}