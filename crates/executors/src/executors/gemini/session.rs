use std::path::PathBuf;

fn sessions_dir(namespace: &str) -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".vibe-kanban").join(namespace))
}

fn ensure_sessions_dir(namespace: &str) -> Option<PathBuf> {
    let dir = sessions_dir(namespace)?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir)
}

fn session_file_path(namespace: &str, session_id: &str) -> Option<PathBuf> {
    let dir = ensure_sessions_dir(namespace)?;
    Some(dir.join(format!("{}.jsonl", session_id)))
}

pub fn append_session_event_json(
    namespace: &str,
    session_id: &str,
    value: &serde_json::Value,
) -> std::io::Result<()> {
    if let Some(path) = session_file_path(namespace, session_id) {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?;
        let mut line = value.to_string();
        line.push('\n');
        use std::io::Write as _;
        f.write_all(line.as_bytes())?;
    }
    Ok(())
}

pub fn v_with_type(typ: &str, mut v: serde_json::Value) -> serde_json::Value {
    match &mut v {
        serde_json::Value::Object(map) => {
            map.insert("type".into(), serde_json::Value::String(typ.to_string()));
            serde_json::Value::Object(map.clone())
        }
        _ => serde_json::json!({"type": typ, "value": v}),
    }
}

pub fn build_local_resume_prompt(namespace: &str, session_id: &str) -> Option<String> {
    let path = session_file_path(namespace, session_id)?;
    let data = std::fs::read_to_string(path).ok()?;
    let mut resume = String::from(
        "You are resuming a previous conversation. Here is the transcript so far:\n\n",
    );
    for line in data.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            let t = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
            match t {
                "user" => {
                    if let Some(text) = v.get("text").and_then(|x| x.as_str()) {
                        resume.push_str("User: ");
                        resume.push_str(text);
                        resume.push_str("\n\n");
                    }
                }
                "assistant_text" => {
                    if let Some(text) = v.get("text").and_then(|x| x.as_str()) {
                        resume.push_str("Assistant: ");
                        resume.push_str(text);
                        resume.push_str("\n\n");
                    }
                }
                "plan" => {
                    if let Some(entries) = v.get("entries").and_then(|x| x.as_array()) {
                        resume.push_str("Assistant plan:\n");
                        for (i, entry) in entries.iter().enumerate() {
                            if let Some(s) = entry.as_str() {
                                resume.push_str(&format!("{}. {}\n", i + 1, s));
                            }
                        }
                        resume.push_str("\n");
                    }
                }
                _ => {}
            }
        }
    }
    Some(resume)
}

pub fn fork_session_file(namespace: &str, old_id: &str, new_id: &str) -> std::io::Result<()> {
    let old_path = session_file_path(namespace, old_id);
    let new_path = session_file_path(namespace, new_id);
    match (old_path, new_path) {
        (Some(old), Some(new)) => {
            // Ensure directory exists
            let _ = ensure_sessions_dir(namespace);
            if std::fs::metadata(&old).is_ok() {
                let _ = std::fs::copy(&old, &new);
            } else {
                // Create empty new file if old doesn't exist
                let _ = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&new);
            }
        }
        _ => {}
    }
    Ok(())
}
