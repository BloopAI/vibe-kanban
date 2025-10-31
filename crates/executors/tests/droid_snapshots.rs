use std::{fs, path::Path};

use executors::executors::droid::{
    log_event_converter::{LogEvent, LogEventConverter},
    types::DroidJson,
};

#[derive(serde::Serialize)]
struct SessionSnapshot {
    log_event_converter: LogEventConverter,
    events: Vec<LogEvent>,
    event_count: usize,
}

fn process_jsonl_file(file_path: &str) -> SessionSnapshot {
    let content = fs::read_to_string(file_path).expect("Failed to read test file");
    let worktree_path = Path::new("/tmp/test-worktree");

    let mut converter = LogEventConverter::default();
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

        let event = converter.to_log_event(&event, worktree_path);
        all_events.extend(event);
    }

    SessionSnapshot {
        event_count: all_events.len(),
        events: all_events,
        log_event_converter: converter,
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
fn test_edits_and_execution_with_and_without_ids_produce_same_result() {
    // Test that both the original (with ids) and no-ids variant produce identical results
    let fixtures = vec![
        "tests/droid_snapshots/fixtures/edits-and-execution.jsonl",
        "tests/droid_snapshots/fixtures/edits-and-execution-no-ids.jsonl",
    ];

    insta::allow_duplicates! {
        for fixture in fixtures {
            let snapshot = process_jsonl_file(fixture);
            insta::assert_yaml_snapshot!("edits_and_execution_same_result", snapshot);
        }
    }
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

#[test]
fn test_rc_claude_session() {
    let snapshot = process_jsonl_file("tests/droid_snapshots/fixtures/rc-claude.jsonl");
    insta::assert_yaml_snapshot!(snapshot);
}
