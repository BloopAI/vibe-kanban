use crate::validated_where::ShapeDefinition;
use shape_macros::define_shape;

// Organization-scoped shapes
define_shape!(PROJECTS, "projects", r#""organization_id" = $1"#, "/shape/projects");
define_shape!(NOTIFICATIONS, "notifications", r#""organization_id" = $1 AND "user_id" = $2"#, "/shape/notifications");

// Project-scoped shapes
define_shape!(WORKSPACES, "workspaces", r#""project_id" = $1"#, "/shape/project/{project_id}/workspaces");
define_shape!(PROJECT_STATUSES, "project_statuses", r#""project_id" = $1"#, "/shape/project/{project_id}/statuses");
define_shape!(TAGS, "tags", r#""project_id" = $1"#, "/shape/project/{project_id}/tags");
define_shape!(ISSUES, "issues", r#""project_id" = $1"#, "/shape/project/{project_id}/issues");
define_shape!(ISSUE_ASSIGNEES, "issue_assignees", r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#, "/shape/project/{project_id}/issue_assignees");
define_shape!(ISSUE_FOLLOWERS, "issue_followers", r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#, "/shape/project/{project_id}/issue_followers");
define_shape!(ISSUE_TAGS, "issue_tags", r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#, "/shape/project/{project_id}/issue_tags");
define_shape!(ISSUE_DEPENDENCIES, "issue_dependencies", r#""blocking_issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#, "/shape/project/{project_id}/issue_dependencies");

// Issue-scoped shapes
define_shape!(ISSUE_COMMENTS, "issue_comments", r#""issue_id" = $1"#, "/shape/issue/{issue_id}/comments");
define_shape!(ISSUE_COMMENT_REACTIONS, "issue_comment_reactions", r#""comment_id" IN (SELECT id FROM issue_comments WHERE "issue_id" = $1)"#, "/shape/issue/{issue_id}/reactions");

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
