use std::{env, fs, path::Path};

use ts_rs::TS; // in [build-dependencies]

fn generate_constants() -> String {
    r#"// Generated constants
export const EXECUTOR_TYPES: string[] = [
    "echo",
    "claude",
    "amp",
    "gemini",
    "charmopencode"
];

export const EDITOR_TYPES: EditorType[] = [
    "vscode",
    "cursor", 
    "windsurf",
    "intellij",
    "zed",
    "custom"
];

export const EXECUTOR_LABELS: Record<string, string> = {
    "echo": "Echo (Test Mode)",
    "claude": "Claude",
    "amp": "Amp",
    "gemini": "Gemini",
    "charmopencode": "Charm Opencode"
};

export const EDITOR_LABELS: Record<string, string> = {
    "vscode": "VS Code",
    "cursor": "Cursor",
    "windsurf": "Windsurf",
    "intellij": "IntelliJ IDEA",
    "zed": "Zed",
    "custom": "Custom"
};

export const SOUND_FILES: SoundFile[] = [
    "abstract-sound1",
    "abstract-sound2",
    "abstract-sound3",
    "abstract-sound4",
    "cow-mooing",
    "phone-vibration",
    "rooster"
];

export const SOUND_LABELS: Record<string, string> = {
    "abstract-sound1": "Gentle Chime",
    "abstract-sound2": "Soft Bell",
    "abstract-sound3": "Digital Tone",
    "abstract-sound4": "Subtle Alert",
    "cow-mooing": "Cow Mooing",
    "phone-vibration": "Phone Vibration",
    "rooster": "Rooster Call"
};"#
    .to_string()
}

fn main() {
    // 1. Make sure ../shared exists
    let shared_path = Path::new("../shared");
    fs::create_dir_all(shared_path).expect("cannot create ../shared");

    println!("Generating TypeScript types…");

    // 2. Let ts-rs write its per-type files here (handy for debugging)
    env::set_var("TS_RS_EXPORT_DIR", shared_path.to_str().unwrap());

    // 3. Grab every Rust type you want on the TS side
    let decls = [
        vibe_kanban::models::ApiResponse::<()>::decl(),
        vibe_kanban::models::config::Config::decl(),
        vibe_kanban::models::config::ThemeMode::decl(),
        vibe_kanban::models::config::EditorConfig::decl(),
        vibe_kanban::models::config::GitHubConfig::decl(),
        vibe_kanban::models::config::EditorType::decl(),
        vibe_kanban::models::config::EditorConstants::decl(),
        vibe_kanban::models::config::SoundFile::decl(),
        vibe_kanban::models::config::SoundConstants::decl(),
        vibe_kanban::routes::config::ConfigConstants::decl(),
        vibe_kanban::executor::ExecutorConfig::decl(),
        vibe_kanban::executor::ExecutorConstants::decl(),
        vibe_kanban::models::project::CreateProject::decl(),
        vibe_kanban::models::project::Project::decl(),
        vibe_kanban::models::project::ProjectWithBranch::decl(),
        vibe_kanban::models::project::UpdateProject::decl(),
        vibe_kanban::models::project::SearchResult::decl(),
        vibe_kanban::models::project::SearchMatchType::decl(),
        vibe_kanban::models::project::GitBranch::decl(),
        vibe_kanban::models::project::CreateBranch::decl(),
        vibe_kanban::models::task::CreateTask::decl(),
        vibe_kanban::models::task::CreateTaskAndStart::decl(),
        vibe_kanban::models::task::TaskStatus::decl(),
        vibe_kanban::models::task::Task::decl(),
        vibe_kanban::models::task::TaskWithAttemptStatus::decl(),
        vibe_kanban::models::task::UpdateTask::decl(),
        vibe_kanban::models::task_attempt::TaskAttemptStatus::decl(),
        vibe_kanban::models::task_attempt::TaskAttempt::decl(),
        vibe_kanban::models::task_attempt::CreateTaskAttempt::decl(),
        vibe_kanban::models::task_attempt::UpdateTaskAttempt::decl(),
        vibe_kanban::models::task_attempt::CreateFollowUpAttempt::decl(),
        vibe_kanban::models::task_attempt_activity::TaskAttemptActivity::decl(),
        vibe_kanban::models::task_attempt_activity::TaskAttemptActivityWithPrompt::decl(),
        vibe_kanban::models::task_attempt_activity::CreateTaskAttemptActivity::decl(),
        vibe_kanban::routes::filesystem::DirectoryEntry::decl(),
        vibe_kanban::models::task_attempt::DiffChunkType::decl(),
        vibe_kanban::models::task_attempt::DiffChunk::decl(),
        vibe_kanban::models::task_attempt::FileDiff::decl(),
        vibe_kanban::models::task_attempt::WorktreeDiff::decl(),
        vibe_kanban::models::task_attempt::BranchStatus::decl(),
        vibe_kanban::models::task_attempt::ExecutionState::decl(),
        vibe_kanban::models::task_attempt::TaskAttemptState::decl(),
        vibe_kanban::models::execution_process::ExecutionProcess::decl(),
        vibe_kanban::models::execution_process::ExecutionProcessSummary::decl(),
        vibe_kanban::models::execution_process::ExecutionProcessStatus::decl(),
        vibe_kanban::models::execution_process::ExecutionProcessType::decl(),
        vibe_kanban::models::execution_process::CreateExecutionProcess::decl(),
        vibe_kanban::models::execution_process::UpdateExecutionProcess::decl(),
        vibe_kanban::models::executor_session::ExecutorSession::decl(),
        vibe_kanban::models::executor_session::CreateExecutorSession::decl(),
        vibe_kanban::models::executor_session::UpdateExecutorSession::decl(),
        vibe_kanban::executor::NormalizedConversation::decl(),
        vibe_kanban::executor::NormalizedEntry::decl(),
        vibe_kanban::executor::NormalizedEntryType::decl(),
        vibe_kanban::executor::ActionType::decl(),
    ];

    // 4. Friendly banner
    const HEADER: &str =
        "// This file was generated by [ts-rs](https://github.com/Aleph-Alpha/ts-rs).\n\
         // Do not edit this file manually.\n\
         // Auto-generated from Rust backend types using ts-rs\n\n";

    // 5. Add `export` if it’s missing, then join
    let body = decls
        .into_iter()
        .map(|d| {
            let trimmed = d.trim_start();
            if trimmed.starts_with("export") {
                d
            } else {
                format!("export {trimmed}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    // 6. Add constants
    let constants = generate_constants();

    // 7. Write the consolidated types.ts
    fs::write(
        shared_path.join("types.ts"),
        format!("{HEADER}{body}\n\n{constants}"),
    )
    .expect("unable to write types.ts");

    println!("✅ TypeScript types generated in ../shared/");
}
