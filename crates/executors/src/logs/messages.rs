//! Projection layer over `Vec<NormalizedEntry>` that the MCP `read_session_messages`
//! tool + the REST `/api/sessions/{id}/messages` route share.

use crate::logs::{NormalizedEntry, NormalizedEntryType};

pub const DEFAULT_LAST_N: u32 = 20;
pub const MAX_LAST_N: u32 = 200;

/// D5a: entry types never surfaced to external readers.
///
/// Written as an exhaustive match rather than `matches!` so that adding a new
/// `NormalizedEntryType` variant forces an explicit D5a decision at compile
/// time.
fn is_permanently_filtered(entry_type: &NormalizedEntryType) -> bool {
    match entry_type {
        // D5a: hide from external readers (transient UI / meta signals).
        NormalizedEntryType::Loading => true,
        NormalizedEntryType::TokenUsageInfo(_) => true,
        NormalizedEntryType::NextAction { .. } => true,
        NormalizedEntryType::UserAnsweredQuestions { .. } => true,
        // Surfaced to external readers (conversation content).
        NormalizedEntryType::UserMessage
        | NormalizedEntryType::UserFeedback { .. }
        | NormalizedEntryType::AssistantMessage
        | NormalizedEntryType::ToolUse { .. }
        | NormalizedEntryType::SystemMessage
        | NormalizedEntryType::ErrorMessage { .. }
        | NormalizedEntryType::Thinking => false,
    }
}

pub fn filter(entries: &[NormalizedEntry], include_thinking: bool) -> Vec<&NormalizedEntry> {
    entries
        .iter()
        .filter(|e| !is_permanently_filtered(&e.entry_type))
        .filter(|e| include_thinking || !matches!(e.entry_type, NormalizedEntryType::Thinking))
        .collect()
}

#[derive(Debug, Clone)]
pub struct PageParams {
    pub last_n: Option<u32>,
    pub from_index: Option<u32>,
    pub include_thinking: bool,
}

pub struct Page<'a> {
    pub entries: Vec<&'a NormalizedEntry>,
    pub total_count: u32,
    pub has_more: bool,
    pub start_index: u32,
}

pub fn page<'a>(entries: &'a [NormalizedEntry], params: &PageParams) -> Page<'a> {
    let filtered = filter(entries, params.include_thinking);
    let total = filtered.len() as u32;

    let (start, end) = if let Some(from) = params.from_index {
        let from = from.min(total);
        let n = params.last_n.unwrap_or(DEFAULT_LAST_N).min(MAX_LAST_N);
        (from, from.saturating_add(n).min(total))
    } else {
        let n = params.last_n.unwrap_or(DEFAULT_LAST_N).min(MAX_LAST_N);
        let start = total.saturating_sub(n);
        (start, total)
    };

    Page {
        entries: filtered[start as usize..end as usize].to_vec(),
        total_count: total,
        has_more: start > 0,
        start_index: start,
    }
}

/// Extract the last AssistantMessage's content (full text, not truncated).
pub fn final_assistant_message(entries: &[NormalizedEntry]) -> Option<String> {
    entries
        .iter()
        .rev()
        .find(|e| matches!(e.entry_type, NormalizedEntryType::AssistantMessage))
        .map(|e| e.content.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logs::{NormalizedEntry, NormalizedEntryType, TokenUsageInfo};

    fn mk(t: NormalizedEntryType, content: &str) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: t,
            content: content.into(),
            metadata: None,
        }
    }

    #[test]
    fn d5a_entries_are_filtered_out() {
        let entries = vec![
            mk(NormalizedEntryType::UserMessage, "hi"),
            mk(NormalizedEntryType::Loading, ""),
            mk(
                NormalizedEntryType::NextAction {
                    failed: false,
                    execution_processes: 0,
                    needs_setup: false,
                },
                "",
            ),
            mk(
                NormalizedEntryType::TokenUsageInfo(TokenUsageInfo::default()),
                "",
            ),
            mk(NormalizedEntryType::AssistantMessage, "hello"),
        ];
        let out = filter(&entries, false);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].content, "hi");
        assert_eq!(out[1].content, "hello");
    }

    #[test]
    fn thinking_is_off_by_default() {
        let entries = vec![
            mk(NormalizedEntryType::Thinking, "plan"),
            mk(NormalizedEntryType::AssistantMessage, "ok"),
        ];
        assert_eq!(filter(&entries, false).len(), 1);
        assert_eq!(filter(&entries, true).len(), 2);
    }

    #[test]
    fn last_n_windows_at_tail() {
        let entries: Vec<_> = (0..50)
            .map(|i| mk(NormalizedEntryType::UserMessage, &format!("{i}")))
            .collect();
        let page = page(
            &entries,
            &PageParams {
                last_n: Some(5),
                from_index: None,
                include_thinking: false,
            },
        );
        assert_eq!(page.total_count, 50);
        assert_eq!(page.entries.len(), 5);
        assert_eq!(page.entries.first().unwrap().content, "45");
        assert!(page.has_more);
    }

    #[test]
    fn from_index_overrides_tail_default() {
        let entries: Vec<_> = (0..10)
            .map(|i| mk(NormalizedEntryType::UserMessage, &format!("{i}")))
            .collect();
        let page = page(
            &entries,
            &PageParams {
                last_n: Some(3),
                from_index: Some(2),
                include_thinking: false,
            },
        );
        assert_eq!(page.entries.len(), 3);
        assert_eq!(page.entries[0].content, "2");
        assert_eq!(page.start_index, 2);
    }

    #[test]
    fn last_n_capped_at_max() {
        let entries: Vec<_> = (0..500)
            .map(|i| mk(NormalizedEntryType::UserMessage, &format!("{i}")))
            .collect();
        let page = page(
            &entries,
            &PageParams {
                last_n: Some(9999),
                from_index: None,
                include_thinking: false,
            },
        );
        assert_eq!(page.entries.len(), MAX_LAST_N as usize);
    }

    #[test]
    fn final_assistant_message_extracts_last() {
        let entries = vec![
            mk(NormalizedEntryType::AssistantMessage, "first"),
            mk(NormalizedEntryType::UserMessage, "hi again"),
            mk(NormalizedEntryType::AssistantMessage, "last"),
        ];
        assert_eq!(final_assistant_message(&entries).as_deref(), Some("last"));
    }

    #[test]
    fn final_assistant_message_handles_no_assistant() {
        let entries = vec![mk(NormalizedEntryType::UserMessage, "alone")];
        assert!(final_assistant_message(&entries).is_none());
    }

    #[test]
    fn empty_input_yields_empty_page() {
        let entries: Vec<NormalizedEntry> = vec![];
        let page = page(
            &entries,
            &PageParams {
                last_n: Some(5),
                from_index: None,
                include_thinking: false,
            },
        );
        assert_eq!(page.total_count, 0);
        assert_eq!(page.entries.len(), 0);
        assert!(!page.has_more);
        assert_eq!(page.start_index, 0);
    }

    #[test]
    fn from_index_past_total_clamps_to_empty_slice() {
        let entries: Vec<_> = (0..5)
            .map(|i| mk(NormalizedEntryType::UserMessage, &format!("{i}")))
            .collect();
        let page = page(
            &entries,
            &PageParams {
                last_n: Some(3),
                from_index: Some(99),
                include_thinking: false,
            },
        );
        assert_eq!(page.total_count, 5);
        assert_eq!(page.entries.len(), 0);
        assert_eq!(page.start_index, 5);
        // has_more == start > 0; start = 5 (after clamp), so true.
        assert!(page.has_more);
    }

    #[test]
    fn last_n_zero_returns_no_entries() {
        let entries: Vec<_> = (0..5)
            .map(|i| mk(NormalizedEntryType::UserMessage, &format!("{i}")))
            .collect();
        let page = page(
            &entries,
            &PageParams {
                last_n: Some(0),
                from_index: None,
                include_thinking: false,
            },
        );
        assert_eq!(page.total_count, 5);
        assert_eq!(page.entries.len(), 0);
        // tail mode with n=0 → start = total - 0 = total, end = total.
        assert_eq!(page.start_index, 5);
        assert!(page.has_more);
    }
}
