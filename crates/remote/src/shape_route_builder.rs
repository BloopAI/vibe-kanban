//! ShapeRouteBuilder: unified registration for Electric proxy + REST fallback routes.
//!
//! Each shape has exactly one proxy handler (GET on its URL) and a required
//! REST fallback route.  The builder pairs the shape with its authorization
//! scope and fallback, then registers both routes in one call.
//!
//! # Example
//!
//! ```ignore
//! use crate::shape_route_builder::{ShapeRouteBuilder, ShapeScope, OrgFallbackQuery};
//! use crate::shapes;
//!
//! let route = ShapeRouteBuilder::new(&shapes::PROJECTS_SHAPE, ShapeScope::Org)
//!     .fallback("/fallback/projects", fallback_list_projects)
//!     .build();
//! ```

use axum::{
    extract::{Extension, Path, Query, State},
    handler::Handler,
    routing::{MethodRouter, get},
};
use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use crate::{
    AppState,
    auth::RequestContext,
    db::organization_members,
    routes::electric_proxy::{OrgShapeQuery, ProxyError, ShapeQuery, proxy_table},
    shape_definition::{ShapeDefinition, ShapeExport},
};

// =============================================================================
// HasQueryParams — structural trait linking handlers to their query extractor
// =============================================================================

/// Marker trait implemented for extractor tuples that include `Query<Q>`.
///
/// This links a fallback handler's query extractor to the declared query type,
/// ensuring the handler accepts the correct scope parameters.
/// Same pattern as `HasJsonPayload` in `mutation_definition`.
pub trait HasQueryParams<Q> {}

impl<Q> HasQueryParams<Q> for (Query<Q>,) {}
impl<A, Q> HasQueryParams<Q> for (A, Query<Q>) {}
impl<A, B, Q> HasQueryParams<Q> for (A, B, Query<Q>) {}
impl<A, B, C, Q> HasQueryParams<Q> for (A, B, C, Query<Q>) {}
impl<A, B, C, D, Q> HasQueryParams<Q> for (A, B, C, D, Query<Q>) {}

// =============================================================================
// Fallback query types — one per scope pattern
// =============================================================================

/// Query params for org-scoped fallback handlers (Org, OrgWithUser).
#[derive(Debug, Deserialize)]
pub struct OrgFallbackQuery {
    pub organization_id: Uuid,
}

/// Query params for project-scoped fallback handlers.
#[derive(Debug, Deserialize)]
pub struct ProjectFallbackQuery {
    pub project_id: Uuid,
}

/// Query params for issue-scoped fallback handlers.
#[derive(Debug, Deserialize)]
pub struct IssueFallbackQuery {
    pub issue_id: Uuid,
}

/// Marker for fallback handlers that require no query parameters.
/// Used for User-scoped shapes where the user ID comes from auth context.
/// Analogous to `NoCreate` in `MutationBuilder`.
#[derive(Debug, Deserialize)]
pub struct NoQueryParams {}

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
// BuiltShapeRoute — type-erased output from ShapeRouteBuilder::build()
// =============================================================================

/// A fully built shape route: router (for registration) + fallback metadata.
///
/// Codegen uses `shapes::all_shapes()` for names and shape metadata;
/// this struct carries the fallback URL keyed by shape URL.
pub struct BuiltShapeRoute {
    pub router: axum::Router<AppState>,
    /// The shape's proxy URL, e.g. `"/shape/projects"`.
    pub url: &'static str,
    /// REST fallback URL, e.g. `"/fallback/projects"`.
    pub fallback_url: &'static str,
}

// =============================================================================
// Type-state markers for ShapeRouteBuilder
// =============================================================================

/// Marker: no fallback registered yet. `.build()` is not available.
pub struct NoFallback;

/// Fallback has been registered. `.build()` is available.
struct FallbackDef {
    url: &'static str,
    handler: MethodRouter<AppState>,
}

// =============================================================================
// ShapeRouteBuilder
// =============================================================================

/// Builder that registers an Electric proxy route and a required REST fallback
/// for a shape definition.
///
/// Generic over `T` (the shape's row type) to enable type-safe fallback
/// handler constraints, and `F` (type-state) to enforce that `.fallback()`
/// is called before `.build()`.
pub struct ShapeRouteBuilder<T: TS + Sync + 'static, F = NoFallback> {
    shape: &'static ShapeDefinition<T>,
    scope: ShapeScope,
    fallback: F,
}

impl<T: TS + Sync + Send + 'static> ShapeRouteBuilder<T, NoFallback> {
    /// Create a new builder for the given shape and authorization scope.
    pub fn new(shape: &'static ShapeDefinition<T>, scope: ShapeScope) -> Self {
        Self {
            shape,
            scope,
            fallback: NoFallback,
        }
    }

    /// Register the required REST fallback handler for this shape.
    ///
    /// The handler's extractor tuple must include `Query<Q>` (enforced by
    /// `HasQueryParams`), ensuring the handler accepts the correct scope
    /// parameters. Use `Query<NoQueryParams>` for handlers that don't need
    /// query parameters (e.g. User-scoped shapes).
    pub fn fallback<H, HT, Q>(
        self,
        url: &'static str,
        handler: H,
    ) -> ShapeRouteBuilder<T, FallbackDef>
    where
        H: Handler<HT, AppState> + Clone + Send + 'static,
        HT: HasQueryParams<Q> + 'static,
    {
        ShapeRouteBuilder {
            shape: self.shape,
            scope: self.scope,
            fallback: FallbackDef {
                url,
                handler: get(handler),
            },
        }
    }
}

impl<T: TS + Sync + Send + 'static> ShapeRouteBuilder<T, FallbackDef> {
    /// Build the finalized shape route, erasing the generic `T`.
    ///
    /// Produces a `BuiltShapeRoute` containing the axum router (with both
    /// proxy and fallback routes) and the shape/fallback URLs for codegen.
    pub fn build(self) -> BuiltShapeRoute {
        let url = self.shape.url();
        let fallback_url = self.fallback.url;

        let proxy_handler = build_proxy_handler(self.shape, self.scope);
        let router = axum::Router::new()
            .route(url, proxy_handler)
            .route(fallback_url, self.fallback.handler);

        BuiltShapeRoute {
            router,
            url,
            fallback_url,
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
                    &[query.organization_id.to_string(), ctx.user.id.to_string()],
                )
                .await
            },
        ),

        ShapeScope::Project => get(
            move |State(state): State<AppState>,
                  Extension(ctx): Extension<RequestContext>,
                  Path(project_id): Path<Uuid>,
                  Query(query): Query<ShapeQuery>| async move {
                organization_members::assert_project_access(state.pool(), project_id, ctx.user.id)
                    .await
                    .map_err(|e| ProxyError::Authorization(e.to_string()))?;

                proxy_table(&state, shape, &query.params, &[project_id.to_string()]).await
            },
        ),

        ShapeScope::Issue => get(
            move |State(state): State<AppState>,
                  Extension(ctx): Extension<RequestContext>,
                  Path(issue_id): Path<Uuid>,
                  Query(query): Query<ShapeQuery>| async move {
                organization_members::assert_issue_access(state.pool(), issue_id, ctx.user.id)
                    .await
                    .map_err(|e| ProxyError::Authorization(e.to_string()))?;

                proxy_table(&state, shape, &query.params, &[issue_id.to_string()]).await
            },
        ),

        ShapeScope::User => get(
            move |State(state): State<AppState>,
                  Extension(ctx): Extension<RequestContext>,
                  Query(query): Query<ShapeQuery>| async move {
                proxy_table(&state, shape, &query.params, &[ctx.user.id.to_string()]).await
            },
        ),
    }
}
