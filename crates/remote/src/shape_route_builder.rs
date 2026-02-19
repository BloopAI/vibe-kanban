//! ShapeRouteBuilder: unified registration for Electric proxy + REST fallback routes.
//!
//! Each shape has exactly one proxy handler (GET on its URL) and an optional
//! REST fallback route.  The builder derives fallback metadata from the shape's
//! params, removing the need for hardcoded strings on the frontend.
//!
//! # Example
//!
//! ```ignore
//! use crate::shape_route_builder::{ShapeRouteBuilder, ShapeScope};
//! use crate::shapes;
//!
//! let builder = ShapeRouteBuilder::new(
//!     &shapes::PROJECTS_SHAPE,
//!     ShapeScope::Org,
//! )
//! .fallback("/v1/projects");
//!
//! // Register the Electric proxy route
//! let router = builder.router();
//!
//! // Extract metadata for TypeScript codegen (name paired externally)
//! let definition = builder.definition("PROJECTS_SHAPE");
//! ```

use axum::{
    extract::{Extension, Path, Query, State},
    routing::{MethodRouter, get},
};
use uuid::Uuid;

use crate::{
    AppState,
    auth::RequestContext,
    db::organization_members,
    routes::electric_proxy::{OrgShapeQuery, ProxyError, ShapeQuery, proxy_table},
    shape_definition::ShapeExport,
};

// =============================================================================
// ShapeScope — authorization patterns for Electric proxy routes
// =============================================================================

/// Authorization scope for an Electric proxy route.
///
/// Each variant maps to a distinct combination of extractor types,
/// authorization check, and Electric parameter construction.
#[derive(Debug, Clone, Copy)]
pub enum ShapeScope {
    /// Org-scoped: `organization_id` from query.
    /// Auth: `assert_membership(organization_id, user_id)`
    /// Electric params: `[organization_id]`
    Org,

    /// Org-scoped with user injection: `organization_id` from query.
    /// Auth: `assert_membership(organization_id, user_id)`
    /// Electric params: `[organization_id, user_id]`
    OrgWithUser,

    /// Project-scoped: `{project_id}` from URL path.
    /// Auth: `assert_project_access(project_id, user_id)`
    /// Electric params: `[project_id]`
    Project,

    /// Issue-scoped: `{issue_id}` from URL path.
    /// Auth: `assert_issue_access(issue_id, user_id)`
    /// Electric params: `[issue_id]`
    Issue,

    /// User-scoped: no client-provided scope param.
    /// Auth: none (implicit — user can only see their own data)
    /// Electric params: `[user_id]`
    User,
}

// =============================================================================
// ShapeRouteDefinition — codegen metadata
// =============================================================================

/// Metadata extracted from a `ShapeRouteBuilder` for TypeScript code generation.
#[derive(Debug)]
pub struct ShapeRouteDefinition {
    pub const_name: &'static str,
    pub table: &'static str,
    pub ts_type_name: String,
    pub params: &'static [&'static str],
    pub url: &'static str,
    /// REST fallback URL, e.g. `"/v1/projects"`.
    pub fallback_url: Option<&'static str>,
}

// =============================================================================
// ShapeRouteBuilder
// =============================================================================

/// Builder that registers an Electric proxy route and optional REST fallback
/// for a shape definition.
pub struct ShapeRouteBuilder {
    shape: &'static dyn ShapeExport,
    scope: ShapeScope,
    fallback_url: Option<&'static str>,
}

impl ShapeRouteBuilder {
    /// Create a new builder for the given shape and authorization scope.
    pub fn new(shape: &'static dyn ShapeExport, scope: ShapeScope) -> Self {
        Self {
            shape,
            scope,
            fallback_url: None,
        }
    }

    /// Register a REST fallback list endpoint URL for this shape.
    ///
    /// The fallback uses the shape's own `params` as query parameters
    /// and `table` as the response field name.
    pub fn fallback(mut self, url: &'static str) -> Self {
        self.fallback_url = Some(url);
        self
    }

    /// Build an axum router with the Electric proxy GET handler.
    pub fn router(&self) -> axum::Router<AppState> {
        let handler = build_proxy_handler(self.shape, self.scope);
        axum::Router::new().route(self.shape.url(), handler)
    }

    /// Extract metadata for TypeScript code generation.
    ///
    /// `const_name` is the TypeScript constant name (e.g. `"PROJECTS_SHAPE"`),
    /// paired externally rather than stored in the builder.
    pub fn definition(&self, const_name: &'static str) -> ShapeRouteDefinition {
        ShapeRouteDefinition {
            const_name,
            table: self.shape.table(),
            ts_type_name: self.shape.ts_type_name(),
            params: self.shape.params(),
            url: self.shape.url(),
            fallback_url: self.fallback_url,
        }
    }
}

// =============================================================================
// Handler construction
// =============================================================================

/// Build the appropriate GET handler for a shape based on its authorization scope.
fn build_proxy_handler(
    shape: &'static dyn ShapeExport,
    scope: ShapeScope,
) -> MethodRouter<AppState> {
    match scope {
        ShapeScope::Org => get(
            move |State(state): State<AppState>,
                  Extension(ctx): Extension<RequestContext>,
                  Query(query): Query<OrgShapeQuery>| async move {
                organization_members::assert_membership(
                    state.pool(),
                    query.organization_id,
                    ctx.user.id,
                )
                .await
                .map_err(|e| ProxyError::Authorization(e.to_string()))?;

                proxy_table(
                    &state,
                    shape,
                    &query.params,
                    &[query.organization_id.to_string()],
                )
                .await
            },
        ),

        ShapeScope::OrgWithUser => get(
            move |State(state): State<AppState>,
                  Extension(ctx): Extension<RequestContext>,
                  Query(query): Query<OrgShapeQuery>| async move {
                organization_members::assert_membership(
                    state.pool(),
                    query.organization_id,
                    ctx.user.id,
                )
                .await
                .map_err(|e| ProxyError::Authorization(e.to_string()))?;

                proxy_table(
                    &state,
                    shape,
                    &query.params,
                    &[
                        query.organization_id.to_string(),
                        ctx.user.id.to_string(),
                    ],
                )
                .await
            },
        ),

        ShapeScope::Project => get(
            move |State(state): State<AppState>,
                  Extension(ctx): Extension<RequestContext>,
                  Path(project_id): Path<Uuid>,
                  Query(query): Query<ShapeQuery>| async move {
                organization_members::assert_project_access(
                    state.pool(),
                    project_id,
                    ctx.user.id,
                )
                .await
                .map_err(|e| ProxyError::Authorization(e.to_string()))?;

                proxy_table(
                    &state,
                    shape,
                    &query.params,
                    &[project_id.to_string()],
                )
                .await
            },
        ),

        ShapeScope::Issue => get(
            move |State(state): State<AppState>,
                  Extension(ctx): Extension<RequestContext>,
                  Path(issue_id): Path<Uuid>,
                  Query(query): Query<ShapeQuery>| async move {
                organization_members::assert_issue_access(
                    state.pool(),
                    issue_id,
                    ctx.user.id,
                )
                .await
                .map_err(|e| ProxyError::Authorization(e.to_string()))?;

                proxy_table(
                    &state,
                    shape,
                    &query.params,
                    &[issue_id.to_string()],
                )
                .await
            },
        ),

        ShapeScope::User => get(
            move |State(state): State<AppState>,
                  Extension(ctx): Extension<RequestContext>,
                  Query(query): Query<ShapeQuery>| async move {
                proxy_table(
                    &state,
                    shape,
                    &query.params,
                    &[ctx.user.id.to_string()],
                )
                .await
            },
        ),
    }
}
