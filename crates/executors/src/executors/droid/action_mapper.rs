use std::path::Path;

use serde_json::Value;
use workspace_utils::path::make_path_relative;

use super::types::DroidToolData;
use crate::logs::{ActionType, FileChange, TodoItem};

pub fn generate_concise_content(tool_name: &str, action_type: &ActionType) -> String {
    match action_type {
        ActionType::FileRead { path } => format!("`{path}`"),
        ActionType::FileEdit { path, .. } => format!("`{path}`"),
        ActionType::CommandRun { command, .. } => format!("`{command}`"),
        ActionType::Search { query } => format!("`{query}`"),
        ActionType::WebFetch { url } => format!("`{url}`"),
        ActionType::TodoManagement { .. } => "TODO list updated".to_string(),
        ActionType::Other { description } => description.clone(),
        _ => tool_name.to_string(),
    }
}

pub fn map_tool_to_action(tool_name: &str, params: &Value, worktree_path: &Path) -> ActionType {
    let tool_json = serde_json::json!({
        "toolName": tool_name,
        "parameters": params
    });

    let tool_data: DroidToolData = match serde_json::from_value(tool_json) {
        Ok(data) => data,
        Err(e) => {
            tracing::warn!(
                tool_name = %tool_name,
                error = %e,
                "Failed to parse DroidToolData from tool parameters"
            );
            return ActionType::Other {
                description: tool_name.to_string(),
            };
        }
    };

    let worktree_path_str = worktree_path.to_string_lossy();

    match tool_data {
        DroidToolData::Read { file_path } => ActionType::FileRead {
            path: make_path_relative(&file_path, &worktree_path_str),
        },
        DroidToolData::LS { directory_path, .. } => ActionType::FileRead {
            path: make_path_relative(&directory_path, &worktree_path_str),
        },
        DroidToolData::Glob { patterns, .. } => ActionType::Search {
            query: patterns.join(", "),
        },
        DroidToolData::Grep { path, .. } => ActionType::FileRead {
            path: path
                .map(|p| make_path_relative(&p, &worktree_path_str))
                .unwrap_or_default(),
        },
        DroidToolData::Execute { command, .. } => ActionType::CommandRun {
            command,
            result: None,
        },
        DroidToolData::Edit { file_path, .. } => ActionType::FileEdit {
            path: make_path_relative(&file_path, &worktree_path_str),
            changes: vec![],
        },
        DroidToolData::MultiEdit { file_path, .. } => ActionType::FileEdit {
            path: make_path_relative(&file_path, &worktree_path_str),
            changes: vec![],
        },
        DroidToolData::Create { file_path, .. } => ActionType::FileEdit {
            path: make_path_relative(&file_path, &worktree_path_str),
            changes: vec![],
        },
        DroidToolData::ApplyPatch { input } => {
            let path = extract_path_from_patch(&serde_json::json!({ "input": input }));
            ActionType::FileEdit {
                path: make_path_relative(&path, &worktree_path_str),
                changes: vec![],
            }
        }
        DroidToolData::TodoWrite { todos } => {
            let todo_items = todos
                .into_iter()
                .map(|item| TodoItem {
                    content: item.content,
                    status: item.status,
                    priority: item.priority,
                })
                .collect();
            ActionType::TodoManagement {
                todos: todo_items,
                operation: "update".to_string(),
            }
        }
        DroidToolData::WebSearch { query, .. } => ActionType::WebFetch { url: query },
        DroidToolData::FetchUrl { url, .. } => ActionType::WebFetch { url },
        DroidToolData::ExitSpecMode { .. } => ActionType::Other {
            description: "ExitSpecMode".to_string(),
        },
        DroidToolData::SlackPostMessage { .. } => ActionType::Other {
            description: "SlackPostMessage".to_string(),
        },
        DroidToolData::Unknown { .. } => ActionType::Other {
            description: tool_name.to_string(),
        },
    }
}

fn extract_path_from_patch(params: &Value) -> String {
    if let Some(input) = params.get("input").and_then(|v| v.as_str()) {
        for line in input.lines() {
            if line.starts_with("*** Update File:") || line.starts_with("*** Create File:") {
                return line
                    .split(':')
                    .nth(1)
                    .map(|s| s.trim().to_string())
                    .unwrap_or_default();
            }
        }
    }
    String::new()
}

pub fn parse_apply_patch_result(value: &Value, worktree_path: &str) -> Option<ActionType> {
    let parsed_value;
    let result_obj = if value.is_object() {
        value
    } else if let Some(s) = value.as_str() {
        match serde_json::from_str::<Value>(s) {
            Ok(v) => {
                parsed_value = v;
                &parsed_value
            }
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    input = %s,
                    "Failed to parse apply_patch result string as JSON"
                );
                return None;
            }
        }
    } else {
        tracing::warn!(
            value_type = ?value,
            "apply_patch result is neither object nor string"
        );
        return None;
    };

    let file_path = result_obj
        .get("file_path")
        .or_else(|| result_obj.get("value").and_then(|v| v.get("file_path")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if file_path.is_none() {
        tracing::warn!(
            result = ?result_obj,
            "apply_patch result missing file_path field"
        );
        return None;
    }

    let file_path = file_path?;

    let diff = result_obj
        .get("diff")
        .or_else(|| result_obj.get("value").and_then(|v| v.get("diff")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let content = result_obj
        .get("content")
        .or_else(|| result_obj.get("value").and_then(|v| v.get("content")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let changes = if let Some(diff_text) = diff {
        vec![FileChange::Edit {
            unified_diff: diff_text,
            has_line_numbers: true,
        }]
    } else if let Some(content_text) = content {
        vec![FileChange::Write {
            content: content_text,
        }]
    } else {
        vec![]
    };

    Some(ActionType::FileEdit {
        path: make_path_relative(&file_path, worktree_path),
        changes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_apply_patch_with_diff() {
        let value = serde_json::json!({
            "success": true,
            "file_path": "/test/file.py",
            "diff": "--- previous\t\n+++ current\t\n@@ -1,3 +1,5 @@\n def hello():\n+    print('world')\n     pass"
        });

        let result = parse_apply_patch_result(&value, "/test");

        assert!(result.is_some());
        if let Some(ActionType::FileEdit { path, changes }) = result {
            assert_eq!(path, "file.py");
            assert_eq!(changes.len(), 1);
            if let FileChange::Edit {
                unified_diff,
                has_line_numbers,
            } = &changes[0]
            {
                assert!(unified_diff.contains("def hello()"));
                assert!(unified_diff.contains("print('world')"));
                assert!(has_line_numbers);
            } else {
                panic!("Expected FileChange::Edit");
            }
        } else {
            panic!("Expected ActionType::FileEdit");
        }
    }

    #[test]
    fn test_parse_apply_patch_with_content() {
        let value = serde_json::json!({
            "success": true,
            "file_path": "/test/new_file.txt",
            "content": "Hello, world!"
        });

        let result = parse_apply_patch_result(&value, "/test");

        assert!(result.is_some());
        if let Some(ActionType::FileEdit { path, changes }) = result {
            assert_eq!(path, "new_file.txt");
            assert_eq!(changes.len(), 1);
            if let FileChange::Write { content } = &changes[0] {
                assert_eq!(content, "Hello, world!");
            } else {
                panic!("Expected FileChange::Write");
            }
        } else {
            panic!("Expected ActionType::FileEdit");
        }
    }

    #[test]
    fn test_parse_apply_patch_with_nested_value() {
        let value = serde_json::json!({
            "value": {
                "success": true,
                "file_path": "/test/nested.py",
                "diff": "--- a\n+++ b\n@@ -1 +1,2 @@\n line1\n+line2"
            }
        });

        let result = parse_apply_patch_result(&value, "/test");

        assert!(result.is_some());
        if let Some(ActionType::FileEdit { path, changes }) = result {
            assert_eq!(path, "nested.py");
            assert_eq!(changes.len(), 1);
        } else {
            panic!("Expected ActionType::FileEdit");
        }
    }

    #[test]
    fn test_parse_apply_patch_from_json_string() {
        let value = serde_json::json!(
            r#"{"success":true,"file_path":"/test/file.txt","content":"test content"}"#
        );

        let result = parse_apply_patch_result(&value, "/test");

        assert!(result.is_some());
        if let Some(ActionType::FileEdit { path, changes }) = result {
            assert_eq!(path, "file.txt");
            assert_eq!(changes.len(), 1);
        } else {
            panic!("Expected ActionType::FileEdit");
        }
    }

    #[test]
    fn test_parse_apply_patch_missing_file_path() {
        let value = serde_json::json!({
            "success": true,
            "content": "some content"
        });

        let result = parse_apply_patch_result(&value, "/test");

        assert!(
            result.is_none(),
            "Should return None when file_path is missing"
        );
    }

    #[test]
    fn test_parse_apply_patch_no_diff_or_content() {
        let value = serde_json::json!({
            "success": true,
            "file_path": "/test/empty.txt"
        });

        let result = parse_apply_patch_result(&value, "/test");

        assert!(result.is_some());
        if let Some(ActionType::FileEdit { path, changes }) = result {
            assert_eq!(path, "empty.txt");
            assert_eq!(
                changes.len(),
                0,
                "Should have empty changes when neither diff nor content is present"
            );
        } else {
            panic!("Expected ActionType::FileEdit");
        }
    }
}
