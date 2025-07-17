use serde_json::{json, Value};

use crate::utils::path::make_path_relative;

/// Normalize tool names to match frontend expectations for purple box styling
pub fn normalize_tool_name(tool_name: &str) -> String {
    match tool_name {
        "Todo" => "todowrite".to_string(), // Generic TODO tool → todowrite
        "TodoWrite" => "todowrite".to_string(),
        "TodoRead" => "todoread".to_string(),
        _ => tool_name.to_string(),
    }
}

/// Helper function to determine action type for tool usage
pub fn determine_action_type(tool_name: &str, input: &Value, worktree_path: &str) -> Value {
    match tool_name.to_lowercase().as_str() {
        "read" => {
            if let Some(file_path) = input.get("filePath").and_then(|p| p.as_str()) {
                json!({
                    "action": "file_read",
                    "path": make_path_relative(file_path, worktree_path)
                })
            } else {
                json!({"action": "other", "description": "File read operation"})
            }
        }
        "write" | "edit" => {
            if let Some(file_path) = input.get("filePath").and_then(|p| p.as_str()) {
                json!({
                    "action": "file_write",
                    "path": make_path_relative(file_path, worktree_path)
                })
            } else {
                json!({"action": "other", "description": "File write operation"})
            }
        }
        "bash" => {
            if let Some(command) = input.get("command").and_then(|c| c.as_str()) {
                json!({"action": "command_run", "command": command})
            } else {
                json!({"action": "other", "description": "Command execution"})
            }
        }
        "grep" => {
            if let Some(pattern) = input.get("pattern").and_then(|p| p.as_str()) {
                json!({"action": "search", "query": pattern})
            } else {
                json!({"action": "other", "description": "Search operation"})
            }
        }
        "todowrite" | "todoread" => {
            json!({"action": "other", "description": "TODO list management"})
        }
        _ => json!({"action": "other", "description": format!("Tool: {}", tool_name)}),
    }
}

/// Helper function to generate concise content for tool usage
pub fn generate_tool_content(tool_name: &str, input: &Value, worktree_path: &str) -> String {
    match tool_name.to_lowercase().as_str() {
        "read" => {
            if let Some(file_path) = input.get("filePath").and_then(|p| p.as_str()) {
                format!("`{}`", make_path_relative(file_path, worktree_path))
            } else {
                "Read file".to_string()
            }
        }
        "write" | "edit" => {
            if let Some(file_path) = input.get("filePath").and_then(|p| p.as_str()) {
                format!("`{}`", make_path_relative(file_path, worktree_path))
            } else {
                "Write file".to_string()
            }
        }
        "bash" => {
            if let Some(command) = input.get("command").and_then(|c| c.as_str()) {
                format!("`{}`", command)
            } else {
                "Execute command".to_string()
            }
        }
        "todowrite" | "todoread" => generate_todo_content(input),
        _ => format!("`{}`", tool_name),
    }
}

/// Generate formatted content for TODO tools
fn generate_todo_content(input: &Value) -> String {
    // Extract todo list from input to show actual todos
    if let Some(todos) = input.get("todos").and_then(|t| t.as_array()) {
        let mut todo_items = Vec::new();
        for todo in todos {
            if let Some(content) = todo.get("content").and_then(|c| c.as_str()) {
                let status = todo
                    .get("status")
                    .and_then(|s| s.as_str())
                    .unwrap_or("pending");
                let status_emoji = match status {
                    "completed" => "✅",
                    "in_progress" => "🔄",
                    "pending" | "todo" => "⏳",
                    _ => "📝",
                };
                let priority = todo
                    .get("priority")
                    .and_then(|p| p.as_str())
                    .unwrap_or("medium");
                todo_items.push(format!("{} {} ({})", status_emoji, content, priority));
            }
        }
        if !todo_items.is_empty() {
            format!("TODO List:\n{}", todo_items.join("\n"))
        } else {
            "Managing TODO list".to_string()
        }
    } else {
        "Managing TODO list".to_string()
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_normalize_tool_name() {
        use crate::executors::sst_opencode::tools::normalize_tool_name;

        // Test TODO tool normalization
        assert_eq!(normalize_tool_name("Todo"), "todowrite");
        assert_eq!(normalize_tool_name("TodoWrite"), "todowrite");
        assert_eq!(normalize_tool_name("TodoRead"), "todoread");

        // Test other tools remain unchanged
        assert_eq!(normalize_tool_name("Read"), "Read");
        assert_eq!(normalize_tool_name("Write"), "Write");
        assert_eq!(normalize_tool_name("bash"), "bash");
        assert_eq!(normalize_tool_name("SomeOtherTool"), "SomeOtherTool");
    }
}
