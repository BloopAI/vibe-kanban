//! Entity definition builder for type-safe route and metadata generation.
//!
//! This module provides `EntityDef`, a builder that:
//! - Generates axum routers with URLs derived from the shape's table name
//! - Captures type information for TypeScript generation
//! - Uses marker traits to enforce request/entity type relationships
//!
//! # Example
//!
//! ```ignore
//! use crate::entity_def::EntityDef;
//! use crate::entities::TAG_SHAPE;
//!
//! pub fn entity() -> EntityDef<Tag, CreateTagRequest, UpdateTagRequest> {
//!     EntityDef::new(&TAG_SHAPE)
//!         .list(list_tags)
//!         .get(get_tag)
//!         .create(create_tag)
//!         .update(update_tag)
//!         .delete(delete_tag)
//! }
//!
//! pub fn router() -> Router<AppState> {
//!     entity().router()
//! }
//! ```

use std::marker::PhantomData;

use axum::{handler::Handler, routing::MethodRouter};
use ts_rs::TS;

use crate::{shapes::ShapeDefinition, AppState};

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
// EntityMeta - Metadata for TypeScript generation
// =============================================================================

/// Metadata extracted from an EntityDef for TypeScript code generation.
#[derive(Debug)]
pub struct EntityMeta {
    pub table: &'static str,
    pub shape_url: &'static str,
    pub mutations_url: String,
    pub row_type: String,
    pub create_type: Option<String>,
    pub update_type: Option<String>,
    pub has_delete: bool,
}

// =============================================================================
// EntityDef Builder
// =============================================================================

/// Builder for entity routes and metadata.
///
/// Type parameters:
/// - `E`: The entity/row type (e.g., `Tag`)
/// - `C`: The create request type, or `()` if no create
/// - `U`: The update request type, or `()` if no update
pub struct EntityDef<E, C = (), U = ()> {
    shape: &'static ShapeDefinition,
    base_route: MethodRouter<AppState>,
    id_route: MethodRouter<AppState>,
    has_create: bool,
    has_update: bool,
    has_delete: bool,
    _phantom: PhantomData<fn() -> (E, C, U)>,
}

impl<E: TS + Send + Sync + 'static> EntityDef<E, NoCreate, NoUpdate> {
    /// Create a new EntityDef from a shape definition.
    pub fn new(shape: &'static ShapeDefinition) -> Self {
        Self {
            shape,
            base_route: MethodRouter::new(),
            id_route: MethodRouter::new(),
            has_create: false,
            has_update: false,
            has_delete: false,
            _phantom: PhantomData,
        }
    }
}

impl<E: TS, C, U> EntityDef<E, C, U> {
    /// Add a list handler (GET /table).
    pub fn list<H, T>(mut self, handler: H) -> Self
    where
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        self.base_route = self.base_route.get(handler);
        self
    }

    /// Add a get handler (GET /table/{id}).
    pub fn get<H, T>(mut self, handler: H) -> Self
    where
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        self.id_route = self.id_route.get(handler);
        self
    }

    /// Add a delete handler (DELETE /table/{id}).
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
        let table = self.shape.table();
        let base_path = format!("/{}", table);
        let id_path = format!("/{}/{{id}}", table);

        axum::Router::new()
            .route(&base_path, self.base_route)
            .route(&id_path, self.id_route)
    }
}

impl<E: TS, U> EntityDef<E, NoCreate, U> {
    /// Add a create handler (POST /table).
    ///
    /// The create request type must implement `CreateRequestFor<Entity = E>`.
    pub fn create<C, H, T>(self, handler: H) -> EntityDef<E, C, U>
    where
        C: TS + CreateRequestFor<Entity = E>,
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        EntityDef {
            shape: self.shape,
            base_route: self.base_route.post(handler),
            id_route: self.id_route,
            has_create: true,
            has_update: self.has_update,
            has_delete: self.has_delete,
            _phantom: PhantomData,
        }
    }
}

impl<E: TS, C> EntityDef<E, C, NoUpdate> {
    /// Add an update handler (PATCH /table/{id}).
    ///
    /// The update request type must implement `UpdateRequestFor<Entity = E>`.
    pub fn update<U, H, T>(self, handler: H) -> EntityDef<E, C, U>
    where
        U: TS + UpdateRequestFor<Entity = E>,
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        EntityDef {
            shape: self.shape,
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
/// Used to handle entities that don't have create or update endpoints.
pub trait MaybeTypeName {
    fn maybe_name() -> Option<String>;
}

/// Marker type for entities without a create endpoint.
pub struct NoCreate;

/// Marker type for entities without an update endpoint.
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
impl<E: TS, C: MaybeTypeName, U: MaybeTypeName> EntityDef<E, C, U> {
    /// Extract metadata for TypeScript generation.
    pub fn metadata(&self) -> EntityMeta {
        EntityMeta {
            table: self.shape.table(),
            shape_url: self.shape.url(),
            mutations_url: format!("/v1/{}", self.shape.table()),
            row_type: E::name(),
            create_type: C::maybe_name(),
            update_type: U::maybe_name(),
            has_delete: self.has_delete,
        }
    }
}
