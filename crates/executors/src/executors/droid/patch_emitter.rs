use std::collections::HashMap;

use super::events::LogEvent;
use crate::logs::utils::patch::ConversationPatch;

/// Trait for index providers (allows testing with fakes)
pub trait IndexProviderLike {
    fn next(&self) -> usize;
}

/// State for translating domain events to patches
pub struct PatchEmitter {
    /// Maps tool_call_id to entry indices
    tool_call_idx: HashMap<String, usize>,
}

impl PatchEmitter {
    pub fn new() -> Self {
        Self {
            tool_call_idx: HashMap::new(),
        }
    }

    /// Convert log events to JSON patches using the index provider
    pub fn emit_patches(
        &mut self,
        events: Vec<LogEvent>,
        index_provider: &dyn IndexProviderLike,
    ) -> Vec<json_patch::Patch> {
        events
            .into_iter()
            .filter_map(|event| self.emit_event(event, index_provider))
            .collect()
    }

    fn emit_event(
        &mut self,
        event: LogEvent,
        index_provider: &dyn IndexProviderLike,
    ) -> Option<json_patch::Patch> {
        match event {
            LogEvent::AddEntry(entry) => {
                let idx = index_provider.next();
                Some(ConversationPatch::add_normalized_entry(idx, entry))
            }
            LogEvent::AddToolCall {
                tool_call_id,
                entry,
            } => {
                let idx = index_provider.next();
                self.tool_call_idx.insert(tool_call_id, idx);
                Some(ConversationPatch::add_normalized_entry(idx, entry))
            }
            LogEvent::UpdateToolCall {
                tool_call_id,
                entry,
            } => {
                if let Some(&idx) = self.tool_call_idx.get(&tool_call_id) {
                    self.tool_call_idx.remove(&tool_call_id);
                    Some(ConversationPatch::replace(idx, entry))
                } else {
                    tracing::warn!(
                        tool_call_id = %tool_call_id,
                        "UpdateToolCall with unknown tool_call_id - skipping"
                    );
                    None
                }
            }
        }
    }
}

impl Default for PatchEmitter {
    fn default() -> Self {
        Self::new()
    }
}
