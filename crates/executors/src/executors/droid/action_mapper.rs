use serde_json::Value;

use super::types::DroidToolData;
use crate::logs::{ActionType, FileChange, TodoItem};

pub fn generate_concise_content(tool_name: &str, action_type: &ActionType) -> String {
    match action_type {
        ActionType::FileRead { path } => format!("`{path}`"),
        ActionType::FileEdit { path, .. } => format!("`{path}`"),
        ActionType::CommandRun { command, .. } => format!("`{command}`"),
        ActionType::Search { query } => format!("`{query}`"),
        ActionType::WebFetch { url } => format!("`{url}`"),
        ActionType::TodoManagement { todos, .. } => {
            if todos.is_empty() {
                "Todo list".to_string()
            } else {
                format!("{} todo items", todos.len())
            }
        }
        ActionType::Other { description } => description.clone(),
        _ => tool_name.to_string(),
    }
}

pub fn map_tool_to_action(tool_name: &str, params: &Value) -> ActionType {
    let tool_json = serde_json::json!({
        "toolName": tool_name,
        "parameters": params
    });

    let tool_data: DroidToolData = match serde_json::from_value(tool_json) {
        Ok(data) => data,
        Err(_) => {
            return ActionType::Other {
                description: tool_name.to_string(),
            };
        }
    };

    match tool_data {
        DroidToolData::Read { file_path } => ActionType::FileRead { path: file_path },
        DroidToolData::LS { directory_path, .. } => ActionType::FileRead {
            path: directory_path,
        },
        DroidToolData::Glob { folder, .. } => ActionType::FileRead { path: folder },
        DroidToolData::Grep { path, .. } => ActionType::FileRead {
            path: path.unwrap_or_default(),
        },
        DroidToolData::Execute { command, .. } => ActionType::CommandRun {
            command,
            result: None,
        },
        DroidToolData::Edit { file_path, .. } => ActionType::FileEdit {
            path: file_path,
            changes: vec![],
        },
        DroidToolData::MultiEdit { file_path, .. } => ActionType::FileEdit {
            path: file_path,
            changes: vec![],
        },
        DroidToolData::Create { file_path, .. } => ActionType::FileEdit {
            path: file_path,
            changes: vec![],
        },
        DroidToolData::ApplyPatch { input } => {
            let path = extract_path_from_patch(&serde_json::json!({ "input": input }));
            ActionType::FileEdit {
                path,
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

pub fn parse_apply_patch_result(value: &Value) -> Option<ActionType> {
    let parsed_value;
    let result_obj = if value.is_object() {
        value
    } else if let Some(s) = value.as_str() {
        parsed_value = serde_json::from_str::<Value>(s).ok()?;
        &parsed_value
    } else {
        return None;
    };

    let file_path = result_obj
        .get("file_path")
        .or_else(|| result_obj.get("value").and_then(|v| v.get("file_path")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())?;

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
        path: file_path,
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

        let result = parse_apply_patch_result(&value);

        assert!(result.is_some());
        if let Some(ActionType::FileEdit { path, changes }) = result {
            assert_eq!(path, "/test/file.py");
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

        let result = parse_apply_patch_result(&value);

        assert!(result.is_some());
        if let Some(ActionType::FileEdit { path, changes }) = result {
            assert_eq!(path, "/test/new_file.txt");
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

        let result = parse_apply_patch_result(&value);

        assert!(result.is_some());
        if let Some(ActionType::FileEdit { path, changes }) = result {
            assert_eq!(path, "/test/nested.py");
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

        let result = parse_apply_patch_result(&value);

        assert!(result.is_some());
        if let Some(ActionType::FileEdit { path, changes }) = result {
            assert_eq!(path, "/test/file.txt");
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

        let result = parse_apply_patch_result(&value);

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

        let result = parse_apply_patch_result(&value);

        assert!(result.is_some());
        if let Some(ActionType::FileEdit { path, changes }) = result {
            assert_eq!(path, "/test/empty.txt");
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
