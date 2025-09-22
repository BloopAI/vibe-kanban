use std::{
    fs::{self, OpenOptions},
    io::{self, Result, Write},
    path::PathBuf,
    str::FromStr,
};

use serde::{Deserialize, Serialize};

use crate::executors::acp::AcpEvent;

/// Manages session persistence and state for ACP interactions
pub struct SessionManager {
    base_dir: PathBuf,
}

impl SessionManager {
    /// Create a new session manager with the given namespace
    pub fn new(namespace: impl Into<String>) -> Result<Self> {
        let namespace = namespace.into();
        let mut vk_dir = dirs::home_dir()
            .ok_or_else(|| io::Error::other("Could not determine home directory"))?
            .join(".vibe-kanban");

        if cfg!(debug_assertions) {
            vk_dir = vk_dir.join("dev");
        }

        let base_dir = vk_dir.join(&namespace);

        fs::create_dir_all(&base_dir)?;

        Ok(Self { base_dir })
    }

    /// Get the file path for a session
    fn session_file_path(&self, session_id: &str) -> PathBuf {
        self.base_dir.join(format!("{session_id}.jsonl"))
    }

    /// Append a raw JSON line to the session log
    ///
    /// We normalize ACP payloads by:
    /// - Removing top-level `sessionId`
    /// - Unwrapping the `update` envelope (store its object directly)
    /// - Dropping top-level `options` (permission menu). Note: `options` is
    ///   mutually exclusive with `update`, so when `update` is present we do not
    ///   perform any `options` stripping.
    pub fn append_raw_line(&self, session_id: &str, raw_json: &str) -> Result<()> {
        let Some(normalized) = Self::normalize_session_event(raw_json) else {
            return Ok(());
        };

        let path = self.session_file_path(session_id);
        let mut file = OpenOptions::new().create(true).append(true).open(path)?;

        writeln!(file, "{normalized}")?;
        Ok(())
    }

    /// Attempt to normalize a raw ACP JSON event into a cleaner shape.
    /// Rules:
    /// - Remove top-level `sessionId` always.
    /// - If `update` is present with an object that has `sessionUpdate`, emit
    ///   a single-key object where key = camelCase(sessionUpdate) and value =
    ///   the `update` object minus `sessionUpdate`.
    /// - If `update` is absent, remove only top-level `options`.
    ///
    /// Returns None if the input is not a JSON object.
    fn normalize_session_event(raw_json: &str) -> Option<String> {
        let mut event = AcpEvent::from_str(raw_json).ok()?;

        match event {
            AcpEvent::SessionStart(..)
            | AcpEvent::Error(..)
            | AcpEvent::Done(..)
            | AcpEvent::Other(..) => return None,

            AcpEvent::User(..)
            | AcpEvent::Message(..)
            | AcpEvent::Thought(..)
            | AcpEvent::ToolCall(..)
            | AcpEvent::ToolUpdate(..)
            | AcpEvent::Plan(..)
            | AcpEvent::AvailableCommands(..)
            | AcpEvent::CurrentMode(..) => {}

            AcpEvent::RequestPermission(req) => event = AcpEvent::ToolUpdate(req.tool_call),
        }

        match event {
            AcpEvent::User(prompt) => {
                return serde_json::to_string(&serde_json::json!({"user": prompt})).ok();
            }
            AcpEvent::Message(ref content) | AcpEvent::Thought(ref content) => {
                if let agent_client_protocol::ContentBlock::Text(text) = content {
                    // Special simplification for pure text messages
                    let key = if let AcpEvent::Message(_) = event {
                        "assistant"
                    } else {
                        "thinking"
                    };
                    return serde_json::to_string(&serde_json::json!({ key: text.text })).ok();
                }
            }
            _ => {}
        }

        serde_json::to_string(&event).ok()
    }

    /// Read the raw JSONL content of a session
    pub fn read_session_raw(&self, session_id: &str) -> Result<String> {
        let path = self.session_file_path(session_id);
        if !path.exists() {
            return Ok(String::new());
        }

        fs::read_to_string(path)
    }

    /// Fork a session to create a new one with the same history
    pub fn fork_session(&self, old_id: &str, new_id: &str) -> Result<()> {
        let old_path = self.session_file_path(old_id);
        let new_path = self.session_file_path(new_id);

        if old_path.exists() {
            fs::copy(&old_path, &new_path)?;
        } else {
            // Create empty new file if old doesn't exist
            OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&new_path)?;
        }

        Ok(())
    }

    /// Delete a session
    pub fn delete_session(&self, session_id: &str) -> Result<()> {
        let path = self.session_file_path(session_id);
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    /// Generate a resume prompt from session history
    pub fn generate_resume_prompt(&self, session_id: &str, current_prompt: &str) -> Result<String> {
        let session_context = self.read_session_raw(session_id)?;

        Ok(format!(
            concat!(
                "RESUME CONTEXT FOR CONTINUING TASK\n\n",
                "=== EXECUTION HISTORY ===\n",
                "The following is the conversation history from this session:\n",
                "{}\n\n",
                "=== CURRENT REQUEST ===\n",
                "{}\n\n",
                "=== INSTRUCTIONS ===\n",
                "You are continuing work on the above task. The execution history shows ",
                "the previous conversation in this session. Please continue from where ",
                "the previous execution left off, taking into account all the context provided above."
            ),
            session_context, current_prompt
        ))
    }
}

/// Session metadata stored separately from events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetadata {
    pub session_id: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub parent_session: Option<String>,
    pub tags: Vec<String>,
}
