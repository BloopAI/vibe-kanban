use std::{fs, path::Path};

use executors::executors::droid::{
    events::{LogEvent, ProcessorState, process_event},
    types::DroidJson,
};

#[derive(serde::Serialize)]
struct SessionSnapshot {
    final_state: ProcessorState,
    events: Vec<LogEvent>,
    event_count: usize,
}

fn process_jsonl_file(file_path: &str) -> SessionSnapshot {
    let content = fs::read_to_string(file_path).expect("Failed to read test file");
    let worktree_path = Path::new("/tmp/test-worktree");

    let mut state = ProcessorState::default();
    let mut all_events = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let event: DroidJson = match serde_json::from_str(line) {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Failed to parse line: {line}\nError: {e}");
                continue;
            }
        };

        let (new_state, events) = process_event(state, &event, worktree_path);
        state = new_state;
        all_events.extend(events);
    }

    SessionSnapshot {
        event_count: all_events.len(),
        events: all_events,
        final_state: state,
    }
}

#[test]
fn test_hello_world_session() {
    let snapshot = process_jsonl_file("tests/droid_snapshots/fixtures/hello-world.jsonl");
    insta::assert_yaml_snapshot!(snapshot);
}

#[test]
fn test_edits_and_execution_session() {
    let snapshot = process_jsonl_file("tests/droid_snapshots/fixtures/edits-and-execution.jsonl");
    insta::assert_yaml_snapshot!(snapshot);
}

#[test]
fn test_glob_permission_denied_session() {
    let snapshot = process_jsonl_file("tests/droid_snapshots/fixtures/glob.jsonl");
    insta::assert_yaml_snapshot!(snapshot);
}

#[test]
fn test_insufficient_perms_session() {
    let snapshot = process_jsonl_file("tests/droid_snapshots/fixtures/insufficient-perms.jsonl");
    insta::assert_yaml_snapshot!(snapshot);
}
