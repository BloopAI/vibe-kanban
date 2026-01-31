//! Skills Discovery Routes

use std::path::PathBuf;

use axum::{
    Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use db::models::swarm_config::SwarmConfig;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{AppState, error::ApiError};

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct Skill {
    pub name: String,
    #[serde(rename = "type")]
    pub skill_type: String,
    pub path: String,
    pub has_skill_file: bool,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct SkillsListResponse {
    pub skills: Vec<Skill>,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct SkillDetail {
    pub name: String,
    pub path: String,
    pub content: String,
    pub files: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

pub fn find_skills_dir(config_path: &str) -> Option<PathBuf> {
    let paths = [
        PathBuf::from(config_path),
        PathBuf::from("/root/.claude/skills"),
        PathBuf::from("/data/.claude/skills"),
    ];

    for path in paths {
        if path.exists() && path.is_dir() {
            return Some(path);
        }
    }

    None
}

fn read_skill_description(skill_path: &PathBuf) -> String {
    let skill_file = skill_path.join("SKILL.md");

    if !skill_file.exists() {
        return String::new();
    }

    match std::fs::read_to_string(&skill_file) {
        Ok(content) => {
            content
                .lines()
                .find(|line| !line.trim().is_empty() && !line.starts_with('#'))
                .map(|line| line.trim().chars().take(100).collect())
                .unwrap_or_default()
        }
        Err(_) => String::new(),
    }
}

pub async fn list_skills(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<ResponseJson<ApiResponse<SkillsListResponse>>, ApiError> {
    let config = SwarmConfig::get(&state.db_pool).await?;
    let skills_dir = find_skills_dir(&config.skills_path);

    let Some(skills_path) = skills_dir else {
        return Ok(ResponseJson(ApiResponse::success(SkillsListResponse {
            skills: vec![],
            total: 0,
        })));
    };

    let entries = std::fs::read_dir(&skills_path)
        .map_err(|e| ApiError::Io(e))?;

    let mut skills: Vec<Skill> = Vec::new();

    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        let entry_path = entry.path();
        let skill_file = entry_path.join("SKILL.md");
        let has_skill_file = skill_file.exists();
        let description = read_skill_description(&entry_path);

        if let Some(ref search) = query.q {
            let search_lower = search.to_lowercase();
            if !name.to_lowercase().contains(&search_lower)
                && !description.to_lowercase().contains(&search_lower)
            {
                continue;
            }
        }

        skills.push(Skill {
            name,
            skill_type: if has_skill_file { "skill".to_string() } else { "directory".to_string() },
            path: entry_path.to_string_lossy().to_string(),
            has_skill_file,
            description,
        });
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name));

    let total = skills.len();

    Ok(ResponseJson(ApiResponse::success(SkillsListResponse {
        skills,
        total,
    })))
}

pub async fn get_skill(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<ResponseJson<ApiResponse<SkillDetail>>, ApiError> {
    let config = SwarmConfig::get(&state.db_pool).await?;
    let skills_dir = find_skills_dir(&config.skills_path)
        .ok_or_else(|| ApiError::BadRequest("Skills directory not found".to_string()))?;

    // Security: Validate skill name to prevent path traversal attacks
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(ApiError::BadRequest("Invalid skill name".to_string()));
    }

    let skill_path = skills_dir.join(&name);

    // Security: Defense in depth against path traversal attacks.
    // The canonicalize() calls MUST succeed - if they fail, we reject the request.
    // This ensures symlinks are resolved and the final path is verified to be
    // within the allowed skills directory. Never skip this check.
    let canonical_skills_dir = skills_dir.canonicalize().map_err(|e| {
        ApiError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to resolve skills directory: {}", e),
        ))
    })?;

    let canonical_skill_path = skill_path.canonicalize().map_err(|_| {
        ApiError::BadRequest(format!("Skill not found: {}", name))
    })?;

    if !canonical_skill_path.starts_with(&canonical_skills_dir) {
        return Err(ApiError::BadRequest("Invalid skill name".to_string()));
    }

    let skill_file = canonical_skill_path.join("SKILL.md");

    if !skill_file.exists() {
        return Err(ApiError::BadRequest(format!("Skill not found: {}", name)));
    }

    let content = std::fs::read_to_string(&skill_file)
        .map_err(|e| ApiError::Io(e))?;

    let files: Vec<String> = std::fs::read_dir(&canonical_skill_path)
        .map_err(|e| ApiError::Io(e))?
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();

    Ok(ResponseJson(ApiResponse::success(SkillDetail {
        name,
        path: canonical_skill_path.to_string_lossy().to_string(),
        content,
        files,
    })))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/skills", get(list_skills))
        .route("/skills/{name}", get(get_skill))
}
