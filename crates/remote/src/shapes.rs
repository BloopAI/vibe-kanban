use shape_macros::define_shape;

use crate::{
    db::{
        issue_assignees::IssueAssignee, issue_comment_reactions::IssueCommentReaction,
        issue_comments::IssueComment, issue_dependencies::IssueDependency,
        issue_followers::IssueFollower, issue_tags::IssueTag, issues::Issue,
        notifications::Notification, project_statuses::ProjectStatus, projects::Project, tags::Tag,
        workspaces::Workspace,
    },
    validated_where::ShapeExport,
};

// Organization-scoped shapes
define_shape!(
    PROJECTS,
    "projects",
    r#""organization_id" = $1"#,
    "/shape/projects",
    Project
);
define_shape!(
    NOTIFICATIONS,
    "notifications",
    r#""organization_id" = $1 AND "user_id" = $2"#,
    "/shape/notifications",
    Notification
);

// Project-scoped shapes
define_shape!(
    WORKSPACES,
    "workspaces",
    r#""project_id" = $1"#,
    "/shape/project/{project_id}/workspaces",
    Workspace
);
define_shape!(
    PROJECT_STATUSES,
    "project_statuses",
    r#""project_id" = $1"#,
    "/shape/project/{project_id}/statuses",
    ProjectStatus
);
define_shape!(
    TAGS,
    "tags",
    r#""project_id" = $1"#,
    "/shape/project/{project_id}/tags",
    Tag
);
define_shape!(
    ISSUES,
    "issues",
    r#""project_id" = $1"#,
    "/shape/project/{project_id}/issues",
    Issue
);
define_shape!(
    ISSUE_ASSIGNEES,
    "issue_assignees",
    r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    "/shape/project/{project_id}/issue_assignees",
    IssueAssignee
);
define_shape!(
    ISSUE_FOLLOWERS,
    "issue_followers",
    r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    "/shape/project/{project_id}/issue_followers",
    IssueFollower
);
define_shape!(
    ISSUE_TAGS,
    "issue_tags",
    r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    "/shape/project/{project_id}/issue_tags",
    IssueTag
);
define_shape!(
    ISSUE_DEPENDENCIES,
    "issue_dependencies",
    r#""blocking_issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    "/shape/project/{project_id}/issue_dependencies",
    IssueDependency
);

// Issue-scoped shapes
define_shape!(
    ISSUE_COMMENTS,
    "issue_comments",
    r#""issue_id" = $1"#,
    "/shape/issue/{issue_id}/comments",
    IssueComment
);
define_shape!(
    ISSUE_COMMENT_REACTIONS,
    "issue_comment_reactions",
    r#""comment_id" IN (SELECT id FROM issue_comments WHERE "issue_id" = $1)"#,
    "/shape/issue/{issue_id}/reactions",
    IssueCommentReaction
);

/// All shape definitions for export - uses trait objects for heterogeneous collection
pub fn all_shapes() -> Vec<&'static dyn ShapeExport> {
    vec![
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
    ]
}

/// Generate TypeScript shapes file with type imports and ShapeDefinition<T>
pub fn export_shapes_typescript() -> String {
    let shapes = all_shapes();

    // Collect unique type names for imports
    let type_names: Vec<String> = shapes.iter().map(|s| s.ts_type_name()).collect();

    let imports = type_names.join(",\n  ");

    let mut output = String::new();

    // Header and imports
    output.push_str("// This file was auto-generated. Do not edit manually.\n");
    output.push_str("import type {\n  ");
    output.push_str(&imports);
    output.push_str(",\n} from './types';\n\n");

    // ShapeDefinition interface
    output.push_str("// Shape definition interface\n");
    output.push_str("export interface ShapeDefinition<T> {\n");
    output.push_str("  readonly table: string;\n");
    output.push_str("  readonly params: readonly string[];\n");
    output.push_str("  readonly url: string;\n");
    output.push_str("  readonly _type: T;  // Phantom field for type inference\n");
    output.push_str("}\n\n");

    // Helper function
    output.push_str("// Helper to create type-safe shape definitions\n");
    output.push_str("function defineShape<T>(\n");
    output.push_str("  table: string,\n");
    output.push_str("  params: readonly string[],\n");
    output.push_str("  url: string\n");
    output.push_str("): ShapeDefinition<T> {\n");
    output.push_str("  return { table, params, url, _type: null as unknown as T };\n");
    output.push_str("}\n\n");

    // Generate individual shape definitions with embedded types
    output.push_str("// Individual shape definitions with embedded types\n");
    for shape in &shapes {
        let const_name = shape.table().to_uppercase();
        let params_str = shape
            .params()
            .iter()
            .map(|p| format!("'{}'", p))
            .collect::<Vec<_>>()
            .join(", ");

        output.push_str(&format!(
            "export const {}_SHAPE = defineShape<{}>(\n  '{}',\n  [{}] as const,\n  '{}'\n);\n\n",
            const_name,
            shape.ts_type_name(),
            shape.table(),
            params_str,
            shape.url()
        ));
    }

    // Generate ALL_SHAPES array
    output.push_str("// All shapes as an array for iteration and factory building\n");
    output.push_str("export const ALL_SHAPES = [\n");
    for shape in &shapes {
        let const_name = shape.table().to_uppercase();
        output.push_str(&format!("  {}_SHAPE,\n", const_name));
    }
    output.push_str("] as const;\n\n");

    // Type helpers
    output.push_str("// Type helper to extract row type from a shape\n");
    output
        .push_str("export type ShapeRowType<S extends ShapeDefinition<unknown>> = S['_type'];\n\n");

    output.push_str("// Union of all shape types\n");
    output.push_str("export type AnyShape = typeof ALL_SHAPES[number];\n\n");

    // Generate shape-to-type mapping
    output.push_str("// Type-safe shape to row type mapping\n");
    output.push_str("export type ShapeRowTypes = {\n");
    for shape in &shapes {
        output.push_str(&format!(
            "  '{}': {};\n",
            shape.table(),
            shape.ts_type_name()
        ));
    }
    output.push_str("};\n");

    output
}
