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
    shapes::ShapeExport,
};
use ts_rs::TS;
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

// =============================================================================
// Entity definition with builder pattern for TypeScript generation
// =============================================================================

struct EntityDef {
    shape: &'static dyn ShapeExport,
    create: Option<String>,
    update: Option<String>,
}

impl EntityDef {
    fn new(shape: &'static dyn ShapeExport) -> Self {
        Self {
            shape,
            create: None,
            update: None,
        }
    }

    fn create<T: TS>(mut self) -> Self {
        self.create = Some(T::name());
        self
    }

    fn update<T: TS>(mut self) -> Self {
        self.update = Some(T::name());
        self
    }

    fn has_mutations(&self) -> bool {
        self.create.is_some() || self.update.is_some()
    }
}

/// All entity definitions for TypeScript generation.
/// Each entity pairs a shape with optional mutation types.
fn all_entities() -> Vec<EntityDef> {
    use remote::shapes::*;

    vec![
        // Entities with mutations
        EntityDef::new(&PROJECTS)
            .create::<CreateProjectRequest>()
            .update::<UpdateProjectRequest>(),
        EntityDef::new(&NOTIFICATIONS)
            .create::<CreateNotificationRequest>()
            .update::<UpdateNotificationRequest>(),
        EntityDef::new(&TAGS)
            .create::<CreateTagRequest>()
            .update::<UpdateTagRequest>(),
        EntityDef::new(&PROJECT_STATUSES)
            .create::<CreateProjectStatusRequest>()
            .update::<UpdateProjectStatusRequest>(),
        EntityDef::new(&ISSUES)
            .create::<CreateIssueRequest>()
            .update::<UpdateIssueRequest>(),
        EntityDef::new(&ISSUE_ASSIGNEES)
            .create::<CreateIssueAssigneeRequest>()
            .update::<UpdateIssueAssigneeRequest>(),
        EntityDef::new(&ISSUE_FOLLOWERS)
            .create::<CreateIssueFollowerRequest>()
            .update::<UpdateIssueFollowerRequest>(),
        EntityDef::new(&ISSUE_TAGS)
            .create::<CreateIssueTagRequest>()
            .update::<UpdateIssueTagRequest>(),
        EntityDef::new(&ISSUE_RELATIONSHIPS)
            .create::<CreateIssueRelationshipRequest>()
            .update::<UpdateIssueRelationshipRequest>(),
        EntityDef::new(&ISSUE_COMMENTS)
            .create::<CreateIssueCommentRequest>()
            .update::<UpdateIssueCommentRequest>(),
        EntityDef::new(&ISSUE_COMMENT_REACTIONS)
            .create::<CreateIssueCommentReactionRequest>()
            .update::<UpdateIssueCommentReactionRequest>(),
        // Shape-only entities (no mutations)
        EntityDef::new(&ORGANIZATION_MEMBERS),
        EntityDef::new(&USERS),
        EntityDef::new(&WORKSPACES),
        EntityDef::new(&PULL_REQUESTS),
    ]
}

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
    let entities = all_entities();
    output.push_str("// Entity definitions\n");
    for entity in &entities {
        let ts_type = entity.shape.ts_type_name();
        let table = entity.shape.table();
        let const_name = to_screaming_snake_case(&ts_type);
        let shape_name = format!("{}_SHAPE", table.to_uppercase());

        if entity.has_mutations() {
            let create_type = entity.create.as_deref().unwrap_or("unknown");
            let update_type = entity.update.as_deref().unwrap_or("unknown");
            output.push_str(&format!(
                "export const {}_ENTITY: EntityDefinition<{}, {}, {}> = {{\n",
                const_name, ts_type, create_type, update_type
            ));
            output.push_str(&format!("  name: '{}',\n", ts_type));
            output.push_str(&format!("  table: '{}',\n", table));
            output.push_str(&format!("  shape: {},\n", shape_name));
            output.push_str(&format!(
                "  mutations: {{ url: '/v1/{}' }} as EntityDefinition<{}, {}, {}>['mutations'],\n",
                table, ts_type, create_type, update_type
            ));
        } else {
            output.push_str(&format!(
                "export const {}_ENTITY: EntityDefinition<{}> = {{\n",
                const_name, ts_type
            ));
            output.push_str(&format!("  name: '{}',\n", ts_type));
            output.push_str(&format!("  table: '{}',\n", table));
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
