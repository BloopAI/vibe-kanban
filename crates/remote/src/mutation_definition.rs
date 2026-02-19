//! Mutation definition builder for type-safe route and metadata generation.
//!
//! This module provides `MutationBuilder`, a builder that:
//! - Generates axum routers for CRUD mutation routes
//! - Captures type information for TypeScript generation
//! - Uses `HasJsonPayload` to ensure handler signatures match declared C/U types
//!
//! # Example
//!
//! ```ignore
//! use crate::mutation_definition::MutationBuilder;
//!
//! pub fn mutation() -> MutationBuilder<Tag, CreateTagRequest, UpdateTagRequest> {
//!     MutationBuilder::new("tags")
//!         .list(list_tags)
//!         .get(get_tag)
//!         .create(create_tag)
//!         .update(update_tag)
//!         .delete(delete_tag)
//! }
//!
//! pub fn router() -> Router<AppState> {
//!     mutation().router()
//! }
//! ```

use std::marker::PhantomData;

use axum::{Json, handler::Handler, routing::MethodRouter};
use ts_rs::TS;

use crate::AppState;

// =============================================================================
// HasJsonPayload - Structural trait linking handlers to their payload types
// =============================================================================

/// Marker trait implemented for extractor tuples that include `Json<T>` as payload.
///
/// This links MutationBuilder's `C`/`U` generic arguments to the actual handler payload
/// type and prevents metadata drift from handler signatures.
pub trait HasJsonPayload<T> {}

impl<T> HasJsonPayload<T> for (Json<T>,) {}
impl<A, T> HasJsonPayload<T> for (A, Json<T>) {}
impl<A, B, T> HasJsonPayload<T> for (A, B, Json<T>) {}
impl<A, B, C, T> HasJsonPayload<T> for (A, B, C, Json<T>) {}
impl<A, B, C, D, T> HasJsonPayload<T> for (A, B, C, D, Json<T>) {}
impl<A, B, C, D, E0, T> HasJsonPayload<T> for (A, B, C, D, E0, Json<T>) {}
impl<A, B, C, D, E0, F, T> HasJsonPayload<T> for (A, B, C, D, E0, F, Json<T>) {}
impl<A, B, C, D, E0, F, G, T> HasJsonPayload<T> for (A, B, C, D, E0, F, G, Json<T>) {}
impl<A, B, C, D, E0, F, G, H, T> HasJsonPayload<T>
    for (A, B, C, D, E0, F, G, H, Json<T>)
{
}

// =============================================================================
// MutationDefinition - Metadata for TypeScript generation
// =============================================================================

/// Metadata extracted from a MutationBuilder for TypeScript code generation.
#[derive(Debug)]
pub struct MutationDefinition {
    pub table: &'static str,
    pub row_type: String,
    pub create_type: Option<String>,
    pub update_type: Option<String>,
    /// URL template for the fallback list endpoint (substituted with shape params).
    /// e.g. "/issues?project_id={project_id}" or "/issue_assignees/by-project/{project_id}"
    pub fallback_list_url: Option<String>,
}

// =============================================================================
// MutationBuilder Builder
// =============================================================================

/// Builder for mutation routes and metadata.
///
/// Type parameters:
/// - `E`: The row type (e.g., `Tag`)
/// - `C`: The create request type, or `NoCreate` if no create
/// - `U`: The update request type, or `NoUpdate` if no update
pub struct MutationBuilder<E, C = (), U = ()> {
    table: &'static str,
    base_route: MethodRouter<AppState>,
    id_route: MethodRouter<AppState>,
    by_project_route: Option<MethodRouter<AppState>>,
    fallback_list_url: Option<String>,
    _phantom: PhantomData<fn() -> (E, C, U)>,
}

impl<E: TS + Send + Sync + 'static> MutationBuilder<E, NoCreate, NoUpdate> {
    /// Create a new MutationBuilder for the given table.
    pub fn new(table: &'static str) -> Self {
        Self {
            table,
            base_route: MethodRouter::new(),
            id_route: MethodRouter::new(),
            by_project_route: None,
            fallback_list_url: None,
            _phantom: PhantomData,
        }
    }
}

impl<E: TS, C, U> MutationBuilder<E, C, U> {
    /// Add a list handler (GET /{table}).
    pub fn list<H, T>(mut self, handler: H) -> Self
    where
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        self.base_route = self.base_route.get(handler);
        self
    }

    /// Add a get handler (GET /{table}/{id}).
    pub fn get<H, T>(mut self, handler: H) -> Self
    where
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        self.id_route = self.id_route.get(handler);
        self
    }

    /// Add a delete handler (DELETE /{table}/{id}).
    pub fn delete<H, T>(mut self, handler: H) -> Self
    where
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        self.id_route = self.id_route.delete(handler);
        self
    }

    /// Add a list-by-project handler (GET /{table}/by-project/{project_id}).
    ///
    /// Used for entities scoped by issue_id in their primary list endpoint
    /// but streamed at project level by Electric. Provides a fallback list
    /// endpoint when Electric is unavailable.
    ///
    /// Also sets `fallback_list_url` to `"/{table}/by-project/{project_id}"`.
    pub fn list_by_project<H, T>(mut self, handler: H) -> Self
    where
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        self.by_project_route = Some(
            self.by_project_route
                .unwrap_or_else(MethodRouter::new)
                .get(handler),
        );
        self.fallback_list_url =
            Some(format!("/{}/by-project/{{project_id}}", self.table));
        self
    }

    /// Set a fallback list URL template for Electric failover.
    ///
    /// Use `{param}` placeholders matching the Electric shape params.
    /// e.g. `"/issues?project_id={project_id}"` or `"/projects?organization_id={organization_id}"`
    ///
    /// The frontend substitutes shape params into this template when Electric is down.
    pub fn fallback_list_url(mut self, url: &str) -> Self {
        self.fallback_list_url = Some(url.to_string());
        self
    }

    /// Build the axum router from the registered handlers.
    pub fn router(self) -> axum::Router<AppState> {
        let base_path = format!("/{}", self.table);
        let id_path = format!("/{}/{{id}}", self.table);

        let mut router = axum::Router::new()
            .route(&base_path, self.base_route)
            .route(&id_path, self.id_route);

        if let Some(by_project_route) = self.by_project_route {
            let by_project_path = format!("/{}/by-project/{{project_id}}", self.table);
            router = router.route(&by_project_path, by_project_route);
        }

        router
    }
}

impl<E: TS, U> MutationBuilder<E, NoCreate, U> {
    /// Add a create handler (POST /{table}).
    ///
    /// The handler's extractor tuple must contain `Json<C>`, ensuring the
    /// declared create type matches what the handler actually accepts.
    pub fn create<C, H, T>(self, handler: H) -> MutationBuilder<E, C, U>
    where
        C: TS,
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: HasJsonPayload<C> + 'static,
    {
        MutationBuilder {
            table: self.table,
            base_route: self.base_route.post(handler),
            id_route: self.id_route,
            by_project_route: self.by_project_route,
            fallback_list_url: self.fallback_list_url,
            _phantom: PhantomData,
        }
    }
}

impl<E: TS, C> MutationBuilder<E, C, NoUpdate> {
    /// Add an update handler (PATCH /{table}/{id}).
    ///
    /// The handler's extractor tuple must contain `Json<U>`, ensuring the
    /// declared update type matches what the handler actually accepts.
    pub fn update<U, H, T>(self, handler: H) -> MutationBuilder<E, C, U>
    where
        U: TS,
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: HasJsonPayload<U> + 'static,
    {
        MutationBuilder {
            table: self.table,
            base_route: self.base_route,
            id_route: self.id_route.patch(handler),
            by_project_route: self.by_project_route,
            fallback_list_url: self.fallback_list_url,
            _phantom: PhantomData,
        }
    }
}

/// Marker type for mutations without a create endpoint.
pub struct NoCreate;

/// Marker type for mutations without an update endpoint.
pub struct NoUpdate;

// Metadata extraction — one impl per combination of NoCreate/NoUpdate vs real types.

impl<E: TS, C: TS, U: TS> MutationBuilder<E, C, U> {
    pub fn definition(&self) -> MutationDefinition {
        MutationDefinition {
            table: self.table,
            row_type: E::name(),
            create_type: Some(C::name()),
            update_type: Some(U::name()),
            fallback_list_url: self.fallback_list_url.clone(),
        }
    }
}

impl<E: TS, U: TS> MutationBuilder<E, NoCreate, U> {
    pub fn definition(&self) -> MutationDefinition {
        MutationDefinition {
            table: self.table,
            row_type: E::name(),
            create_type: None,
            update_type: Some(U::name()),
            fallback_list_url: self.fallback_list_url.clone(),
        }
    }
}

impl<E: TS, C: TS> MutationBuilder<E, C, NoUpdate> {
    pub fn definition(&self) -> MutationDefinition {
        MutationDefinition {
            table: self.table,
            row_type: E::name(),
            create_type: Some(C::name()),
            update_type: None,
            fallback_list_url: self.fallback_list_url.clone(),
        }
    }
}

impl<E: TS> MutationBuilder<E, NoCreate, NoUpdate> {
    pub fn definition(&self) -> MutationDefinition {
        MutationDefinition {
            table: self.table,
            row_type: E::name(),
            create_type: None,
            update_type: None,
            fallback_list_url: self.fallback_list_url.clone(),
        }
    }
}
