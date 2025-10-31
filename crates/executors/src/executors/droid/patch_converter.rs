use std::collections::HashMap;

use super::log_event_converter::LogEvent;
use crate::logs::utils::{EntryIndexProvider, patch::ConversationPatch};

#[derive(Default)]
pub struct PatchConverter {
    /// Maps tool_call_id to entry indices
    tool_call_idx: HashMap<String, usize>,
}

impl PatchConverter {
    pub fn process_event(
        &mut self,
        event: LogEvent,
        index_provider: &EntryIndexProvider,
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
