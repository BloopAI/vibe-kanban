use std::{
    fs, io,
    path::{Path, PathBuf},
};

use serde_json::Value;
use uuid::Uuid;

pub fn fork_session(session_id: &str) -> io::Result<String> {
    let root = sessions_root()?;
    let source = find_session_file(&root, &format!("{session_id}.jsonl"))?;
    let contents = fs::read_to_string(&source)?;
    let ends_with_newline = contents.ends_with('\n');

    let new_session_id = Uuid::new_v4().to_string();
    let replaced = contents
        .lines()
        .enumerate()
        .map(|(idx, line)| {
            if idx == 0 {
                replace_session_id(line, &new_session_id)
            } else {
                line.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    let mut output = replaced;
    if ends_with_newline {
        output.push('\n');
    }

    let destination = source
        .parent()
        .unwrap_or(root.as_path())
        .join(format!("{new_session_id}.jsonl"));
    fs::write(&destination, output)?;

    if let Ok(settings_source) = find_session_file(&root, &format!("{session_id}.settings.json")) {
        let settings_destination = settings_source
            .parent()
            .unwrap_or(root.as_path())
            .join(format!("{new_session_id}.settings.json"));
        let _ = fs::copy(settings_source, settings_destination);
    }

    Ok(new_session_id)
}

fn sessions_root() -> io::Result<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".factory").join("sessions"))
        .ok_or_else(|| io::Error::other("Unable to determine home directory"))
}

fn replace_session_id(line: &str, new_session_id: &str) -> String {
    if let Ok(mut meta) = serde_json::from_str::<Value>(line)
        && meta
            .get("type")
            .and_then(|value| value.as_str())
            .map(|value| value == "session_start")
            .unwrap_or(false)
        && let Some(Value::String(id)) = meta.get_mut("id")
    {
        *id = new_session_id.to_string();
        if let Ok(serialized) = serde_json::to_string(&meta) {
            return serialized;
        }
    }

    line.to_string()
}

fn find_session_file(root: &Path, filename: &str) -> io::Result<PathBuf> {
    if root.join(filename).exists() {
        return Ok(root.join(filename));
    }

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let candidate = path.join(filename);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!("Unable to locate {filename} in {}", root.display()),
    ))
}
