use std::marker::PhantomData;

use ts_rs::TS;

use crate::db::{
    issue_assignees::IssueAssignee, issue_comment_reactions::IssueCommentReaction,
    issue_comments::IssueComment, issue_dependencies::IssueDependency,
    issue_followers::IssueFollower, issue_tags::IssueTag, issues::Issue,
    notifications::Notification, project_statuses::ProjectStatus, projects::Project, tags::Tag,
    workspaces::Workspace,
};

#[derive(Debug)]
pub struct ShapeDefinition<T: TS> {
    pub table: &'static str,
    pub where_clause: &'static str,
    pub params: &'static [&'static str],
    pub url: &'static str,
    _phantom: PhantomData<T>,
}

/// Trait to allow heterogeneous collection of shapes for export
pub trait ShapeExport: Sync {
    fn table(&self) -> &'static str;
    fn where_clause(&self) -> &'static str;
    fn params(&self) -> &'static [&'static str];
    fn url(&self) -> &'static str;
    fn ts_type_name(&self) -> String;
}

impl<T: TS + Sync> ShapeExport for ShapeDefinition<T> {
    fn table(&self) -> &'static str {
        self.table
    }
    fn where_clause(&self) -> &'static str {
        self.where_clause
    }
    fn params(&self) -> &'static [&'static str] {
        self.params
    }
    fn url(&self) -> &'static str {
        self.url
    }
    fn ts_type_name(&self) -> String {
        T::name()
    }
}

/// Macro to define shapes with compile-time SQL validation.
///
/// The macro validates SQL at compile time using `sqlx::query!`, ensuring that:
/// - The table exists
/// - The columns in the WHERE clause exist
/// - The SQL syntax is correct
///
/// Usage:
/// ```ignore
/// define_shape!(
///     PROJECTS, Project,
///     table: "projects",
///     where_clause: r#""organization_id" = $1"#,
///     url: "/shape/projects",
///     params: ["organization_id"]
/// );
/// ```
#[macro_export]
macro_rules! define_shape {
    (
        $name:ident, $type:ty,
        table: $table:literal,
        where_clause: $where:literal,
        url: $url:literal,
        params: [$($param:literal),* $(,)?]
    ) => {
        pub const $name: $crate::shapes::ShapeDefinition<$type> = {
            // Compile-time SQL validation - this ensures table and columns exist
            // We use dummy UUID values for parameter validation since all shape
            // params are UUIDs
            #[allow(dead_code)]
            fn _validate() {
                let _ = sqlx::query!(
                    "SELECT 1 AS v FROM " + $table + " WHERE " + $where
                    $(, { let _ = stringify!($param); uuid::Uuid::nil() })*
                );
            }

            $crate::shapes::ShapeDefinition {
                table: $table,
                where_clause: $where,
                params: &[$($param),*],
                url: $url,
                _phantom: std::marker::PhantomData,
            }
        };
    };
}

// Organization-scoped shapes
define_shape!(
    PROJECTS, Project,
    table: "projects",
    where_clause: r#""organization_id" = $1"#,
    url: "/shape/projects",
    params: ["organization_id"]
);

define_shape!(
    NOTIFICATIONS, Notification,
    table: "notifications",
    where_clause: r#""organization_id" = $1 AND "user_id" = $2"#,
    url: "/shape/notifications",
    params: ["organization_id", "user_id"]
);

// Project-scoped shapes
define_shape!(
    WORKSPACES, Workspace,
    table: "workspaces",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/workspaces",
    params: ["project_id"]
);

define_shape!(
    PROJECT_STATUSES, ProjectStatus,
    table: "project_statuses",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/statuses",
    params: ["project_id"]
);

define_shape!(
    TAGS, Tag,
    table: "tags",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/tags",
    params: ["project_id"]
);

define_shape!(
    ISSUES, Issue,
    table: "issues",
    where_clause: r#""project_id" = $1"#,
    url: "/shape/project/{project_id}/issues",
    params: ["project_id"]
);

define_shape!(
    ISSUE_ASSIGNEES, IssueAssignee,
    table: "issue_assignees",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_assignees",
    params: ["project_id"]
);

define_shape!(
    ISSUE_FOLLOWERS, IssueFollower,
    table: "issue_followers",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_followers",
    params: ["project_id"]
);

define_shape!(
    ISSUE_TAGS, IssueTag,
    table: "issue_tags",
    where_clause: r#""issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_tags",
    params: ["project_id"]
);

define_shape!(
    ISSUE_DEPENDENCIES, IssueDependency,
    table: "issue_dependencies",
    where_clause: r#""blocking_issue_id" IN (SELECT id FROM issues WHERE "project_id" = $1)"#,
    url: "/shape/project/{project_id}/issue_dependencies",
    params: ["project_id"]
);

// Issue-scoped shapes
define_shape!(
    ISSUE_COMMENTS, IssueComment,
    table: "issue_comments",
    where_clause: r#""issue_id" = $1"#,
    url: "/shape/issue/{issue_id}/comments",
    params: ["issue_id"]
);

define_shape!(
    ISSUE_COMMENT_REACTIONS, IssueCommentReaction,
    table: "issue_comment_reactions",
    where_clause: r#""comment_id" IN (SELECT id FROM issue_comments WHERE "issue_id" = $1)"#,
    url: "/shape/issue/{issue_id}/reactions",
    params: ["issue_id"]
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
