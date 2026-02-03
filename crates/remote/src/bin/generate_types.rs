use std::{env, fs, path::Path};

use remote::{
    db::{
        organization_members::OrganizationMember,
        pull_requests::PullRequest,
        types::PullRequestStatus,
        users::{User, UserData},
        workspaces::Workspace,
    },
    entities::all_shapes,
};
use utils::api::{
    entities::{
        CreateIssueAssigneeRequest, CreateIssueCommentReactionRequest, CreateIssueCommentRequest,
        CreateIssueFollowerRequest, CreateIssueRelationshipRequest, CreateIssueRequest,
        CreateIssueTagRequest, CreateNotificationRequest, CreateProjectRequest,
        CreateProjectStatusRequest, CreateTagRequest, Issue, IssueAssignee, IssueComment,
        IssueCommentReaction, IssueFollower, IssueRelationship, IssueTag, Notification,
        NotificationType, Project, ProjectStatus, Tag, UpdateIssueAssigneeRequest,
        UpdateIssueCommentReactionRequest, UpdateIssueCommentRequest, UpdateIssueFollowerRequest,
        UpdateIssueRelationshipRequest, UpdateIssueRequest, UpdateIssueTagRequest,
        UpdateNotificationRequest, UpdateProjectRequest, UpdateProjectStatusRequest,
        UpdateTagRequest,
    },
    organizations::MemberRole,
    types::{IssuePriority, IssueRelationshipType},
};
use ts_rs::TS;

fn main() {
    let args: Vec<String> = env::args().collect();
    let check_mode = args.iter().any(|arg| arg == "--check");

    let typescript = export_shapes();

    // Path to shared/remote-types.ts relative to workspace root
    let output_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent() // crates/
        .unwrap()
        .parent() // workspace root
        .unwrap()
        .join("shared/remote-types.ts");

    if check_mode {
        let current = fs::read_to_string(&output_path).unwrap_or_default();
        if current == typescript {
            println!("✅ shared/remote-types.ts is up to date.");
            std::process::exit(0);
        } else {
            eprintln!("❌ shared/remote-types.ts is not up to date.");
            eprintln!("Please run 'pnpm run remote:generate-types' and commit the changes.");
            std::process::exit(1);
        }
    } else {
        fs::write(&output_path, &typescript).expect("Failed to write remote-types.ts");
        println!(
            "✅ Generated remote types and shapes to {}",
            output_path.display()
        );
    }
}

/// Entity definition - optionally has CRUD mutations
struct EntityDef {
    name: &'static str,
    table: &'static str,
    ts_type: &'static str,
    /// If Some, entity has mutations with the given (create_type, update_type)
    mutations: Option<(&'static str, &'static str)>,
}

/// Get all entity definitions
fn all_entity_defs() -> Vec<EntityDef> {
    vec![
        // Entities with mutations
        EntityDef {
            name: "Project",
            table: "projects",
            ts_type: "Project",
            mutations: Some(("CreateProjectRequest", "UpdateProjectRequest")),
        },
        EntityDef {
            name: "Notification",
            table: "notifications",
            ts_type: "Notification",
            mutations: Some(("CreateNotificationRequest", "UpdateNotificationRequest")),
        },
        EntityDef {
            name: "Tag",
            table: "tags",
            ts_type: "Tag",
            mutations: Some(("CreateTagRequest", "UpdateTagRequest")),
        },
        EntityDef {
            name: "ProjectStatus",
            table: "project_statuses",
            ts_type: "ProjectStatus",
            mutations: Some(("CreateProjectStatusRequest", "UpdateProjectStatusRequest")),
        },
        EntityDef {
            name: "Issue",
            table: "issues",
            ts_type: "Issue",
            mutations: Some(("CreateIssueRequest", "UpdateIssueRequest")),
        },
        EntityDef {
            name: "IssueAssignee",
            table: "issue_assignees",
            ts_type: "IssueAssignee",
            mutations: Some(("CreateIssueAssigneeRequest", "UpdateIssueAssigneeRequest")),
        },
        EntityDef {
            name: "IssueFollower",
            table: "issue_followers",
            ts_type: "IssueFollower",
            mutations: Some(("CreateIssueFollowerRequest", "UpdateIssueFollowerRequest")),
        },
        EntityDef {
            name: "IssueTag",
            table: "issue_tags",
            ts_type: "IssueTag",
            mutations: Some(("CreateIssueTagRequest", "UpdateIssueTagRequest")),
        },
        EntityDef {
            name: "IssueRelationship",
            table: "issue_relationships",
            ts_type: "IssueRelationship",
            mutations: Some(("CreateIssueRelationshipRequest", "UpdateIssueRelationshipRequest")),
        },
        EntityDef {
            name: "IssueComment",
            table: "issue_comments",
            ts_type: "IssueComment",
            mutations: Some(("CreateIssueCommentRequest", "UpdateIssueCommentRequest")),
        },
        EntityDef {
            name: "IssueCommentReaction",
            table: "issue_comment_reactions",
            ts_type: "IssueCommentReaction",
            mutations: Some((
                "CreateIssueCommentReactionRequest",
                "UpdateIssueCommentReactionRequest",
            )),
        },
        // Shape-only entities (no mutations)
        EntityDef {
            name: "OrganizationMember",
            table: "organization_member_metadata",
            ts_type: "OrganizationMember",
            mutations: None,
        },
        EntityDef {
            name: "User",
            table: "users",
            ts_type: "User",
            mutations: None,
        },
        EntityDef {
            name: "Workspace",
            table: "workspaces",
            ts_type: "Workspace",
            mutations: None,
        },
        EntityDef {
            name: "PullRequest",
            table: "pull_requests",
            ts_type: "PullRequest",
            mutations: None,
        },
    ]
}

/// Generate TypeScript shapes file with embedded types and shape definitions
fn export_shapes() -> String {
    let shapes = all_shapes();

    let mut output = String::new();

    // Header
    output.push_str("// This file was auto-generated by generate_types in the remote crate.\n");
    output.push_str("// Do not edit manually.\n\n");

    // Generate type declarations for all Electric types
    output.push_str("// Electric row types\n");
    let type_decls = vec![
        serde_json::Value::decl(),
        Project::decl(),
        Notification::decl(),
        NotificationType::decl(),
        Workspace::decl(),
        ProjectStatus::decl(),
        Tag::decl(),
        Issue::decl(),
        IssueAssignee::decl(),
        IssueFollower::decl(),
        IssueTag::decl(),
        IssueRelationship::decl(),
        IssueRelationshipType::decl(),
        IssueComment::decl(),
        IssueCommentReaction::decl(),
        IssuePriority::decl(),
        PullRequestStatus::decl(),
        PullRequest::decl(),
        UserData::decl(),
        User::decl(),
        MemberRole::decl(),
        OrganizationMember::decl(),
        // Mutation request types
        CreateProjectRequest::decl(),
        UpdateProjectRequest::decl(),
        CreateNotificationRequest::decl(),
        UpdateNotificationRequest::decl(),
        CreateTagRequest::decl(),
        UpdateTagRequest::decl(),
        CreateProjectStatusRequest::decl(),
        UpdateProjectStatusRequest::decl(),
        CreateIssueRequest::decl(),
        UpdateIssueRequest::decl(),
        CreateIssueAssigneeRequest::decl(),
        UpdateIssueAssigneeRequest::decl(),
        CreateIssueFollowerRequest::decl(),
        UpdateIssueFollowerRequest::decl(),
        CreateIssueTagRequest::decl(),
        UpdateIssueTagRequest::decl(),
        CreateIssueRelationshipRequest::decl(),
        UpdateIssueRelationshipRequest::decl(),
        CreateIssueCommentRequest::decl(),
        UpdateIssueCommentRequest::decl(),
        CreateIssueCommentReactionRequest::decl(),
        UpdateIssueCommentReactionRequest::decl(),
    ];

    for decl in type_decls {
        let trimmed = decl.trim_start();
        if trimmed.starts_with("export") {
            output.push_str(&decl);
        } else {
            output.push_str("export ");
            output.push_str(trimmed);
        }
        output.push_str("\n\n");
    }

    // ShapeDefinition interface
    output.push_str("// Shape definition interface\n");
    output.push_str("export interface ShapeDefinition<T> {\n");
    output.push_str("  readonly table: string;\n");
    output.push_str("  readonly params: readonly string[];\n");
    output.push_str("  readonly url: string;\n");
    output.push_str(
        "  readonly _type: T;  // Phantom field for type inference (not present at runtime)\n",
    );
    output.push_str("}\n\n");

    // Helper function
    output.push_str("// Helper to create type-safe shape definitions\n");
    output.push_str("function defineShape<T>(\n");
    output.push_str("  table: string,\n");
    output.push_str("  params: readonly string[],\n");
    output.push_str("  url: string\n");
    output.push_str("): ShapeDefinition<T> {\n");
    output.push_str("  return { table, params, url } as ShapeDefinition<T>;\n");
    output.push_str("}\n\n");

    // Generate individual shape definitions
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
            "export const {}_SHAPE = defineShape<{}>(\n  '{}',\n  [{}] as const,\n  '/v1{}'\n);\n\n",
            const_name,
            shape.ts_type_name(),
            shape.table(),
            params_str,
            shape.url()
        ));
    }

    // Generate EntityDefinition interface for SDK generation
    output.push_str(
        "// =============================================================================\n",
    );
    output.push_str("// Entity Definitions for SDK Generation\n");
    output.push_str(
        "// =============================================================================\n\n",
    );

    output.push_str("// Entity definition interface\n");
    output.push_str(
        "export interface EntityDefinition<TRow, TCreate = unknown, TUpdate = unknown> {\n",
    );
    output.push_str("  readonly name: string;\n");
    output.push_str("  readonly table: string;\n");
    output.push_str("  readonly shape: ShapeDefinition<TRow>;\n");
    output.push_str("  readonly mutations: {\n");
    output.push_str("    readonly url: string;\n");
    output.push_str("    readonly _createType: TCreate;  // Phantom (not present at runtime)\n");
    output.push_str("    readonly _updateType: TUpdate;  // Phantom (not present at runtime)\n");
    output.push_str("  } | null;\n");
    output.push_str("}\n\n");

    // Generate individual entity definitions
    let entities = all_entity_defs();
    output.push_str("// Entity definitions\n");
    for entity in &entities {
        let const_name = to_screaming_snake_case(entity.name);
        let shape_name = format!("{}_SHAPE", entity.table.to_uppercase());

        if let Some((create_type, update_type)) = entity.mutations {
            output.push_str(&format!(
                "export const {}_ENTITY: EntityDefinition<{}, {}, {}> = {{\n",
                const_name, entity.ts_type, create_type, update_type
            ));
            output.push_str(&format!("  name: '{}',\n", entity.name));
            output.push_str(&format!("  table: '{}',\n", entity.table));
            output.push_str(&format!("  shape: {},\n", shape_name));
            output.push_str(&format!(
                "  mutations: {{ url: '/v1/{}' }} as EntityDefinition<{}, {}, {}>['mutations'],\n",
                entity.table, entity.ts_type, create_type, update_type
            ));
        } else {
            output.push_str(&format!(
                "export const {}_ENTITY: EntityDefinition<{}> = {{\n",
                const_name, entity.ts_type
            ));
            output.push_str(&format!("  name: '{}',\n", entity.name));
            output.push_str(&format!("  table: '{}',\n", entity.table));
            output.push_str(&format!("  shape: {},\n", shape_name));
            output.push_str("  mutations: null,\n");
        }
        output.push_str("};\n\n");
    }

    // Type helpers for entities
    output.push_str("// Type helper to extract row type from an entity\n");
    output.push_str("export type EntityRowType<E extends EntityDefinition<unknown>> = E extends EntityDefinition<infer R> ? R : never;\n");

    output
}

/// Convert PascalCase to SCREAMING_SNAKE_CASE
fn to_screaming_snake_case(s: &str) -> String {
    let mut result = String::new();
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() && i > 0 {
            result.push('_');
        }
        result.push(c.to_ascii_uppercase());
    }
    result
}
