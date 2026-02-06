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
    _phantom: PhantomData<fn() -> (E, C, U)>,
}

impl<E: TS + Send + Sync + 'static> MutationBuilder<E, NoCreate, NoUpdate> {
    /// Create a new MutationBuilder for the given table.
    pub fn new(table: &'static str) -> Self {
        Self {
            table,
            base_route: MethodRouter::new(),
            id_route: MethodRouter::new(),
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

    /// Build the axum router from the registered handlers.
    pub fn router(self) -> axum::Router<AppState> {
        let base_path = format!("/{}", self.table);
        let id_path = format!("/{}/{{id}}", self.table);

        axum::Router::new()
            .route(&base_path, self.base_route)
            .route(&id_path, self.id_route)
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
        }
    }
}
