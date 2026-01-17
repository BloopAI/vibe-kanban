use crate::validated_where::ShapeDefinition;

// Organization-scoped shapes
pub const PROJECTS: ShapeDefinition = ShapeDefinition::new(
    "projects",
    r#""organization_id" = $1"#,
    &["organization_id"],
    "/shape/projects",
);

pub const NOTIFICATIONS: ShapeDefinition = ShapeDefinition::new(
    "notifications",
    r#""organization_id" = $1 AND "user_id" = $2"#,
    &["organization_id", "user_id"],
    "/shape/notifications",
);

// Project-scoped shapes
pub const WORKSPACES: ShapeDefinition = ShapeDefinition::new(
    "workspaces",
    r#""project_id" = $1"#,
    &["project_id"],
    "/shape/project/{project_id}/workspaces",
);

pub const PROJECT_STATUSES: ShapeDefinition = ShapeDefinition::new(
    "project_statuses",
    r#""project_id" = $1"#,
    &["project_id"],
    "/shape/project/{project_id}/statuses",
);

pub const TAGS: ShapeDefinition = ShapeDefinition::new(
    "tags",
    r#""project_id" = $1"#,
    &["project_id"],
    "/shape/project/{project_id}/tags",
);

pub const ISSUES: ShapeDefinition = ShapeDefinition::new(
    "issues",
    r#""project_id" = $1"#,
    &["project_id"],
    "/shape/project/{project_id}/issues",
);

pub const ISSUE_ASSIGNEES: ShapeDefinition = ShapeDefinition::new(
    "issue_assignees",
    r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    &["project_id"],
    "/shape/project/{project_id}/issue_assignees",
);

pub const ISSUE_FOLLOWERS: ShapeDefinition = ShapeDefinition::new(
    "issue_followers",
    r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    &["project_id"],
    "/shape/project/{project_id}/issue_followers",
);

pub const ISSUE_TAGS: ShapeDefinition = ShapeDefinition::new(
    "issue_tags",
    r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    &["project_id"],
    "/shape/project/{project_id}/issue_tags",
);

pub const ISSUE_DEPENDENCIES: ShapeDefinition = ShapeDefinition::new(
    "issue_dependencies",
    r#""blocking_issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    &["project_id"],
    "/shape/project/{project_id}/issue_dependencies",
);

// Issue-scoped shapes
pub const ISSUE_COMMENTS: ShapeDefinition = ShapeDefinition::new(
    "issue_comments",
    r#""issue_id" = $1"#,
    &["issue_id"],
    "/shape/issue/{issue_id}/comments",
);

pub const ISSUE_COMMENT_REACTIONS: ShapeDefinition = ShapeDefinition::new(
    "issue_comment_reactions",
    r#""comment_id" IN (SELECT id FROM issue_comments WHERE "issue_id" = $1)"#,
    &["issue_id"],
    "/shape/issue/{issue_id}/reactions",
);

/// All shape definitions - single source for JSON export and router
pub const ALL_SHAPES: &[&ShapeDefinition] = &[
    &PROJECTS,
    &NOTIFICATIONS,
    &WORKSPACES,
    &PROJECT_STATUSES,
    &TAGS,
    &ISSUES,
    &ISSUE_ASSIGNEES,
    &ISSUE_FOLLOWERS,
    &ISSUE_TAGS,
    &ISSUE_DEPENDENCIES,
    &ISSUE_COMMENTS,
    &ISSUE_COMMENT_REACTIONS,
];

/// Export all shapes to JSON
pub fn export_shapes_json() -> String {
    serde_json::to_string_pretty(
        &ALL_SHAPES
            .iter()
            .map(|s| {
                serde_json::json!({
                    "table": s.table,
                    "params": s.params,
                    "url": s.url
                })
            })
            .collect::<Vec<_>>(),
    )
    .unwrap()
}
