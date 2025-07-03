#[cfg(test)]
mod tests {
    use crate::{
        executor::{Executor, NormalizedEntryType},
        executors::{AmpExecutor, ClaudeExecutor},
    };

    #[test]
    fn test_amp_log_normalization() {
        let amp_executor = AmpExecutor;
        let amp_logs = r#"{"type":"initial","threadID":"T-f8f7fec0-b330-47ab-b63a-b72c42f1ef6a"}
{"type":"messages","messages":[[0,{"role":"user","content":[{"type":"text","text":"Task title: Create and start should open task\nTask description: When I press 'create & start' on task creation dialog it should then open the task in the sidebar"}],"meta":{"sentAt":1751544747623}}]],"toolResults":[]}
{"type":"messages","messages":[[1,{"role":"assistant","content":[{"type":"thinking","thinking":"The user wants to implement a feature where pressing \"create & start\" on the task creation dialog should open the task in the sidebar."},{"type":"text","text":"I'll help you implement the \"create & start\" functionality. Let me explore the codebase to understand the current task creation and sidebar structure."},{"type":"tool_use","id":"toolu_01FQqskzGAhZaZu8H6qSs5pV","name":"todo_write","input":{"todos":[{"id":"1","content":"Explore task creation dialog component","status":"todo","priority":"high"}]}}],"state":{"type":"complete","stopReason":"tool_use"}}]],"toolResults":[]}"#;

        let result = amp_executor.normalize_logs(amp_logs).unwrap();

        assert_eq!(result.executor_type, "amp");
        assert_eq!(
            result.session_id,
            Some("T-f8f7fec0-b330-47ab-b63a-b72c42f1ef6a".to_string())
        );
        assert!(!result.entries.is_empty());

        // Check that we have user message, assistant message, thinking, and tool use entries
        let user_messages: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::UserMessage))
            .collect();
        assert!(!user_messages.is_empty());

        let assistant_messages: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::AssistantMessage))
            .collect();
        assert!(!assistant_messages.is_empty());

        let thinking_entries: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::Thinking))
            .collect();
        assert!(!thinking_entries.is_empty());

        let tool_uses: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::ToolUse { .. }))
            .collect();
        assert!(!tool_uses.is_empty());

        // Check that tool use content is concise (not the old verbose format)
        let todo_tool_use = tool_uses.iter().find(|e| match &e.entry_type {
            NormalizedEntryType::ToolUse { tool_name, .. } => tool_name == "todo_write",
            _ => false,
        });
        assert!(todo_tool_use.is_some());
        let todo_tool_use = todo_tool_use.unwrap();
        // Should be concise, not "Tool: todo_write with input: ..."
        assert_eq!(todo_tool_use.content, "Managing TODO list");
    }

    #[test]
    fn test_claude_log_normalization() {
        let claude_executor = ClaudeExecutor;
        let claude_logs = r#"{"type":"system","subtype":"init","cwd":"/private/tmp/mission-control-worktree-8ff34214-7bb4-4a5a-9f47-bfdf79e20368","session_id":"499dcce4-04aa-4a3e-9e0c-ea0228fa87c9","tools":["Task","Bash","Glob","Grep","LS","exit_plan_mode","Read","Edit","MultiEdit","Write","NotebookRead","NotebookEdit","WebFetch","TodoRead","TodoWrite","WebSearch"],"mcp_servers":[],"model":"claude-sonnet-4-20250514","permissionMode":"bypassPermissions","apiKeySource":"none"}
{"type":"assistant","message":{"id":"msg_014xUHgkAhs6cRx5WVT3s7if","type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"I'll help you list your projects using vibe-kanban. Let me first explore the codebase to understand how vibe-kanban works and find your projects."}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":4,"cache_creation_input_tokens":13497,"cache_read_input_tokens":0,"output_tokens":1,"service_tier":"standard"}},"parent_tool_use_id":null,"session_id":"499dcce4-04aa-4a3e-9e0c-ea0228fa87c9"}
{"type":"assistant","message":{"id":"msg_014xUHgkAhs6cRx5WVT3s7if","type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"tool_use","id":"toolu_01Br3TvXdmW6RPGpB5NihTHh","name":"Task","input":{"description":"Find vibe-kanban projects","prompt":"I need to find and list projects using vibe-kanban."}}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":4,"cache_creation_input_tokens":13497,"cache_read_input_tokens":0,"output_tokens":1,"service_tier":"standard"}},"parent_tool_use_id":null,"session_id":"499dcce4-04aa-4a3e-9e0c-ea0228fa87c9"}"#;

        let result = claude_executor.normalize_logs(claude_logs).unwrap();

        assert_eq!(result.executor_type, "claude");
        assert_eq!(
            result.session_id,
            Some("499dcce4-04aa-4a3e-9e0c-ea0228fa87c9".to_string())
        );
        assert!(!result.entries.is_empty());

        // Check that we have system, assistant message, and tool use entries
        let system_messages: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::SystemMessage))
            .collect();
        assert!(!system_messages.is_empty());

        let assistant_messages: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::AssistantMessage))
            .collect();
        assert!(!assistant_messages.is_empty());

        let tool_uses: Vec<_> = result
            .entries
            .iter()
            .filter(|e| matches!(e.entry_type, NormalizedEntryType::ToolUse { .. }))
            .collect();
        assert!(!tool_uses.is_empty());

        // Check that tool use content is concise (not the old verbose format)
        let task_tool_use = tool_uses.iter().find(|e| match &e.entry_type {
            NormalizedEntryType::ToolUse { tool_name, .. } => tool_name == "Task",
            _ => false,
        });
        assert!(task_tool_use.is_some());
        let task_tool_use = task_tool_use.unwrap();
        // Should be the task description, not "Tool: Task with input: ..."
        assert_eq!(task_tool_use.content, "Find vibe-kanban projects");
    }
}
