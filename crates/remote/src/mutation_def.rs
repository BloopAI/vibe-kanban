//! Mutation definition builder for type-safe route and metadata generation.
//!
//! This module provides `MutationDef`, a builder that:
//! - Generates axum routers for CRUD mutation routes
//! - Captures type information for TypeScript generation
//! - Uses marker traits to enforce request/entity type relationships
//!
//! # Example
//!
//! ```ignore
//! use crate::mutation_def::MutationDef;
//!
//! pub fn mutation() -> MutationDef<Tag, CreateTagRequest, UpdateTagRequest> {
//!     MutationDef::new("tags", "/v1/tags")
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

use axum::{handler::Handler, routing::MethodRouter};
use ts_rs::TS;

use crate::AppState;

// =============================================================================
// Marker Traits
// =============================================================================

/// Marker trait linking a create request type to its entity type.
pub trait CreateRequestFor {
    type Entity;
}

/// Marker trait linking an update request type to its entity type.
pub trait UpdateRequestFor {
    type Entity;
}

// =============================================================================
// MutationMeta - Metadata for TypeScript generation
// =============================================================================

/// Metadata extracted from a MutationDef for TypeScript code generation.
#[derive(Debug)]
pub struct MutationMeta {
    pub table: &'static str,
    pub url: &'static str,
    pub row_type: String,
    pub create_type: Option<String>,
    pub update_type: Option<String>,
    pub has_delete: bool,
}

// =============================================================================
// MutationDef Builder
// =============================================================================

/// Builder for mutation routes and metadata.
///
/// Type parameters:
/// - `E`: The entity/row type (e.g., `Tag`)
/// - `C`: The create request type, or `NoCreate` if no create
/// - `U`: The update request type, or `NoUpdate` if no update
pub struct MutationDef<E, C = (), U = ()> {
    table: &'static str,
    url: &'static str,
    base_route: MethodRouter<AppState>,
    id_route: MethodRouter<AppState>,
    has_create: bool,
    has_update: bool,
    has_delete: bool,
    _phantom: PhantomData<fn() -> (E, C, U)>,
}

impl<E: TS + Send + Sync + 'static> MutationDef<E, NoCreate, NoUpdate> {
    /// Create a new MutationDef with explicit table name and URL.
    pub fn new(table: &'static str, url: &'static str) -> Self {
        Self {
            table,
            url,
            base_route: MethodRouter::new(),
            id_route: MethodRouter::new(),
            has_create: false,
            has_update: false,
            has_delete: false,
            _phantom: PhantomData,
        }
    }
}

impl<E: TS, C, U> MutationDef<E, C, U> {
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
        self.has_delete = true;
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

impl<E: TS, U> MutationDef<E, NoCreate, U> {
    /// Add a create handler (POST /{table}).
    ///
    /// The create request type must implement `CreateRequestFor<Entity = E>`.
    pub fn create<C, H, T>(self, handler: H) -> MutationDef<E, C, U>
    where
        C: TS + CreateRequestFor<Entity = E>,
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        MutationDef {
            table: self.table,
            url: self.url,
            base_route: self.base_route.post(handler),
            id_route: self.id_route,
            has_create: true,
            has_update: self.has_update,
            has_delete: self.has_delete,
            _phantom: PhantomData,
        }
    }
}

impl<E: TS, C> MutationDef<E, C, NoUpdate> {
    /// Add an update handler (PATCH /{table}/{id}).
    ///
    /// The update request type must implement `UpdateRequestFor<Entity = E>`.
    pub fn update<U, H, T>(self, handler: H) -> MutationDef<E, C, U>
    where
        U: TS + UpdateRequestFor<Entity = E>,
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        MutationDef {
            table: self.table,
            url: self.url,
            base_route: self.base_route,
            id_route: self.id_route.patch(handler),
            has_create: self.has_create,
            has_update: true,
            has_delete: self.has_delete,
            _phantom: PhantomData,
        }
    }
}

// =============================================================================
// MaybeTypeName - Helper for optional type names in metadata
// =============================================================================

/// Trait for types that may or may not have a TS type name.
/// Used to handle mutations that don't have create or update endpoints.
pub trait MaybeTypeName {
    fn maybe_name() -> Option<String>;
}

/// Marker type for mutations without a create endpoint.
pub struct NoCreate;

/// Marker type for mutations without an update endpoint.
pub struct NoUpdate;

impl MaybeTypeName for NoCreate {
    fn maybe_name() -> Option<String> {
        None
    }
}

impl MaybeTypeName for NoUpdate {
    fn maybe_name() -> Option<String> {
        None
    }
}

impl<T: TS> MaybeTypeName for T {
    fn maybe_name() -> Option<String> {
        Some(T::name())
    }
}

// Metadata extraction
impl<E: TS, C: MaybeTypeName, U: MaybeTypeName> MutationDef<E, C, U> {
    /// Extract metadata for TypeScript generation.
    pub fn metadata(&self) -> MutationMeta {
        MutationMeta {
            table: self.table,
            url: self.url,
            row_type: E::name(),
            create_type: C::maybe_name(),
            update_type: U::maybe_name(),
            has_delete: self.has_delete,
        }
    }
}
