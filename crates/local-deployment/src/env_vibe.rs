//! Process `.env.vibe` template files for worktrees.
//!
//! This module handles template processing for environment files, supporting:
//! - `{{ auto_port() }}` - Automatic port assignment
//! - `{{ branch() }}` - Branch name substitution

use std::{
    collections::{HashMap, HashSet},
    net::TcpListener,
};

use regex::Regex;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum EnvVibeError {
    #[error("Failed to find available port after {0} attempts")]
    NoAvailablePort(u32),
    #[error("Regex error: {0}")]
    Regex(#[from] regex::Error),
}

/// Result of processing an .env.vibe template
#[derive(Debug, Clone)]
pub struct EnvVibeResult {
    /// The processed content with all placeholders replaced
    pub processed_content: String,
    /// Map of environment variable names to their assigned ports
    pub assigned_ports: HashMap<String, u16>,
}

const MAX_PORT_ATTEMPTS: u32 = 1000;
pub const DEFAULT_PORT_RANGE_START: u16 = 1024;
pub const DEFAULT_PORT_RANGE_END: u16 = 65535;

/// Process an .env.vibe template, replacing placeholders with values.
pub fn process_env_vibe_template(
    content: &str,
    branch_name: &str,
    used_ports: &HashSet<u16>,
    port_range: (u16, u16),
) -> Result<EnvVibeResult, EnvVibeError> {
    // Track ports assigned within this file to avoid duplicates
    let mut file_ports: HashSet<u16> = HashSet::new();
    // Track which env var got which port (for the result)
    let mut assigned_ports: HashMap<String, u16> = HashMap::new();

    let mut result_lines: Vec<String> = Vec::new();

    // Regex for auto_port(): {{ auto_port() }} or {{ auto_port() | default }}
    let auto_port_re = Regex::new(r"\{\{\s*auto_port\(\)(?:\s*\|\s*[^}]*)?\s*\}\}")?;
    // Regex for branch(): {{ branch() }} or {{ branch() | default }}
    let branch_re = Regex::new(r"\{\{\s*branch\(\)(?:\s*\|\s*([^}]*))?\s*\}\}")?;
    // Regex to extract env var name from a line like KEY=value
    let env_var_re = Regex::new(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=")?;

    for line in content.lines() {
        let mut processed_line = line.to_string();

        // Process {{ auto_port() }} placeholders
        while auto_port_re.is_match(&processed_line) {
            let port = find_available_port(used_ports, &file_ports, port_range)?;
            file_ports.insert(port);

            // Try to extract the env var name for tracking
            if let Some(caps) = env_var_re.captures(&processed_line) {
                let var_name = caps.get(1).unwrap().as_str().to_string();
                assigned_ports.insert(var_name, port);
            }

            // Replace only the first occurrence
            processed_line = auto_port_re
                .replace(&processed_line, port.to_string())
                .to_string();
        }

        // Process {{ branch() }} placeholders
        processed_line = branch_re
            .replace_all(&processed_line, |caps: &regex::Captures| {
                if !branch_name.is_empty() {
                    branch_name.to_string()
                } else if let Some(default) = caps.get(1) {
                    default.as_str().trim().to_string()
                } else {
                    // No branch and no default - keep original
                    caps.get(0).unwrap().as_str().to_string()
                }
            })
            .to_string();

        result_lines.push(processed_line);
    }

    Ok(EnvVibeResult {
        processed_content: result_lines.join("\n"),
        assigned_ports,
    })
}

fn find_available_port(
    used_ports: &HashSet<u16>,
    file_ports: &HashSet<u16>,
    port_range: (u16, u16),
) -> Result<u16, EnvVibeError> {
    use rand::Rng;
    let mut rng = rand::rng();

    for _ in 0..MAX_PORT_ATTEMPTS {
        let port = rng.random_range(port_range.0..=port_range.1);

        // Check not used by other worktrees
        if used_ports.contains(&port) {
            continue;
        }

        // Check not already assigned in this file
        if file_ports.contains(&port) {
            continue;
        }

        // Check system availability via socket binding
        if is_port_available(port) {
            return Ok(port);
        }
    }

    Err(EnvVibeError::NoAvailablePort(MAX_PORT_ATTEMPTS))
}

/// Check if a port is available by attempting to bind to it.
fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auto_port_replacement() {
        let content = "WEB_PORT={{ auto_port() }}";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "main",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        // Should have replaced the placeholder with a port number
        assert!(!result.processed_content.contains("{{"));
        assert!(!result.processed_content.contains("auto_port"));

        // Should have tracked the port assignment
        assert_eq!(result.assigned_ports.len(), 1);
        assert!(result.assigned_ports.contains_key("WEB_PORT"));

        let port = result.assigned_ports["WEB_PORT"];
        assert!((DEFAULT_PORT_RANGE_START..=DEFAULT_PORT_RANGE_END).contains(&port));
    }

    #[test]
    fn test_auto_port_with_default() {
        let content = "PORT={{ auto_port() | 8080 }}";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "main",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        // Default should be ignored, a port should be generated
        assert!(!result.processed_content.contains("8080"));
        assert!(!result.processed_content.contains("{{"));
        assert_eq!(result.assigned_ports.len(), 1);

        let port = result.assigned_ports["PORT"];
        assert!((DEFAULT_PORT_RANGE_START..=DEFAULT_PORT_RANGE_END).contains(&port));
    }

    #[test]
    fn test_multiple_auto_ports() {
        let content =
            "WEB_PORT={{ auto_port() }}\nAPI_PORT={{ auto_port() }}\nDB_PORT={{ auto_port() }}";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "main",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        // Should have 3 unique ports
        assert_eq!(result.assigned_ports.len(), 3);
        assert!(result.assigned_ports.contains_key("WEB_PORT"));
        assert!(result.assigned_ports.contains_key("API_PORT"));
        assert!(result.assigned_ports.contains_key("DB_PORT"));

        // All ports should be unique
        let ports: HashSet<u16> = result.assigned_ports.values().copied().collect();
        assert_eq!(ports.len(), 3);
    }

    #[test]
    fn test_auto_port_avoids_used_ports() {
        let content = "PORT={{ auto_port() }}";

        // Create a large set of "used" ports to increase chance of collision
        let mut used_ports: HashSet<u16> = HashSet::new();
        for port in 1024..60000 {
            used_ports.insert(port);
        }

        let result = process_env_vibe_template(
            content,
            "main",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        // Generated port should not be in used_ports
        let port = result.assigned_ports["PORT"];
        assert!(!used_ports.contains(&port));
        assert!((60000..=DEFAULT_PORT_RANGE_END).contains(&port));
    }

    #[test]
    fn test_branch_replacement() {
        let content = "BRANCH={{ branch() }}";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "vk/feature-branch",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        assert_eq!(result.processed_content, "BRANCH=vk/feature-branch");
        assert!(result.assigned_ports.is_empty());
    }

    #[test]
    fn test_branch_with_default_uses_branch() {
        let content = "ENV={{ branch() | production }}";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "vk/my-branch",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        assert_eq!(result.processed_content, "ENV=vk/my-branch");
    }

    #[test]
    fn test_branch_with_default_uses_default() {
        let content = "ENV={{ branch() | production }}";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        assert_eq!(result.processed_content, "ENV=production");
    }

    #[test]
    fn test_branch_without_default_keeps_placeholder_when_empty() {
        let content = "ENV={{ branch() }}";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        // With no branch and no default, keep the placeholder
        assert_eq!(result.processed_content, "ENV={{ branch() }}");
    }

    #[test]
    fn test_mixed_placeholders() {
        let content = "PORT={{ auto_port() }}\nBRANCH={{ branch() }}\nAPI_PORT={{ auto_port() }}";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "feature/login",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        // Should have 2 port assignments
        assert_eq!(result.assigned_ports.len(), 2);

        // Should contain branch replacement
        assert!(result.processed_content.contains("BRANCH=feature/login"));

        // Should not contain any placeholders
        assert!(!result.processed_content.contains("{{"));
    }

    #[test]
    fn test_no_placeholders() {
        let content = "HOST=localhost\nPORT=3000\nDEBUG=true";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "main",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        assert_eq!(result.processed_content, content);
        assert!(result.assigned_ports.is_empty());
    }

    #[test]
    fn test_whitespace_variants() {
        let test_cases = vec![
            "PORT={{auto_port()}}",
            "PORT={{ auto_port() }}",
            "PORT={{  auto_port()  }}",
            "PORT={{ auto_port()}}",
            "PORT={{auto_port() }}",
        ];

        for content in test_cases {
            let result = process_env_vibe_template(
                content,
                "main",
                &HashSet::new(),
                (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
            )
            .unwrap();

            assert!(
                !result.processed_content.contains("{{"),
                "Failed for: {}",
                content
            );
            assert_eq!(result.assigned_ports.len(), 1, "Failed for: {}", content);
        }
    }

    #[test]
    fn test_port_availability_check() {
        use rand::Rng;
        let high_port: u16 = 60000 + (rand::rng().random::<u16>() % 5000);

        // This might occasionally fail if the port happens to be in use,
        // but should pass in most environments
        let _available = is_port_available(high_port);
        // We just verify the function runs without panic - result is non-deterministic
    }

    #[test]
    fn test_preserves_comments_and_empty_lines() {
        let content = "# This is a comment\n\nPORT={{ auto_port() }}\n# Another comment";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "main",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        let lines: Vec<&str> = result.processed_content.lines().collect();
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0], "# This is a comment");
        assert_eq!(lines[1], "");
        assert!(lines[2].starts_with("PORT="));
        assert_eq!(lines[3], "# Another comment");
    }

    #[test]
    fn test_complex_env_file() {
        let content = r#"# Database configuration
DB_HOST=localhost
DB_PORT={{ auto_port() }}
DB_NAME=myapp_{{ branch() | dev }}

# API configuration
API_PORT={{ auto_port() | 8080 }}
API_URL=http://localhost:{{ auto_port() }}

# Feature flags
DEBUG=true"#;

        let result = process_env_vibe_template(
            content,
            "feature/auth",
            &HashSet::new(),
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        // Should have 3 port assignments (DB_PORT, API_PORT, API_URL line)
        // Note: API_URL line won't have a named port since the pattern doesn't match KEY=value exactly
        assert!(result.assigned_ports.contains_key("DB_PORT"));
        assert!(result.assigned_ports.contains_key("API_PORT"));

        // Branch should be replaced
        assert!(
            result
                .processed_content
                .contains("DB_NAME=myapp_feature/auth")
        );

        // No placeholders should remain
        assert!(!result.processed_content.contains("{{ auto_port()"));
        assert!(!result.processed_content.contains("{{ branch()"));
    }

    #[test]
    fn test_multiple_ports_on_same_line() {
        // Edge case: multiple auto_port() on same line
        let content = "PORTS={{ auto_port() }},{{ auto_port() }}";
        let used_ports = HashSet::new();

        let result = process_env_vibe_template(
            content,
            "main",
            &used_ports,
            (DEFAULT_PORT_RANGE_START, DEFAULT_PORT_RANGE_END),
        )
        .unwrap();

        // Should have replaced both, but only PORTS key tracked (first one)
        assert!(!result.processed_content.contains("{{"));

        // The line should have two different port numbers separated by comma
        let parts: Vec<&str> = result.processed_content.split('=').collect();
        assert_eq!(parts.len(), 2);

        let port_parts: Vec<&str> = parts[1].split(',').collect();
        assert_eq!(port_parts.len(), 2);

        let port1: u16 = port_parts[0].parse().unwrap();
        let port2: u16 = port_parts[1].parse().unwrap();
        assert_ne!(port1, port2); // Should be different ports
    }
}
