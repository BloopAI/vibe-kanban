//! Entity definition builder for type-safe route and metadata generation.
//!
//! This module provides `EntityDef`, a builder that:
//! - Generates axum routers with URLs derived from the shape's table name
//! - Captures type information for TypeScript generation
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

use axum::{Json, handler::Handler, routing::MethodRouter};
use ts_rs::TS;

use crate::{shapes::ShapeDefinition, AppState};

// =============================================================================
// Handler payload typing
// =============================================================================

/// Marker trait implemented for extractor tuples that include `Json<T>` as payload.
///
/// This links EntityDef's `C`/`U` generic arguments to the actual handler payload
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
// EntityMeta - Metadata for TypeScript generation
// =============================================================================

/// Metadata extracted from an EntityDef for TypeScript code generation.
#[derive(Debug)]
pub struct EntityMeta {
    pub table: &'static str,
    pub mutations_url: String,
    pub row_type: String,
    pub create_type: Option<String>,
    pub update_type: Option<String>,
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
    _phantom: PhantomData<fn() -> (E, C, U)>,
}

impl<E: TS + Send + Sync + 'static> EntityDef<E, NoCreate, NoUpdate> {
    /// Create a new EntityDef from a shape definition.
    pub fn new(shape: &'static ShapeDefinition) -> Self {
        Self {
            shape,
            base_route: MethodRouter::new(),
            id_route: MethodRouter::new(),
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
    pub fn create<C, H, Extractors>(self, handler: H) -> EntityDef<E, C, U>
    where
        C: TS,
        H: Handler<Extractors, AppState> + Clone + Send + 'static,
        Extractors: HasJsonPayload<C> + 'static,
    {
        EntityDef {
            shape: self.shape,
            base_route: self.base_route.post(handler),
            id_route: self.id_route,
            _phantom: PhantomData,
        }
    }
}

impl<E: TS, C> EntityDef<E, C, NoUpdate> {
    /// Add an update handler (PATCH /table/{id}).
    pub fn update<U, H, Extractors>(self, handler: H) -> EntityDef<E, C, U>
    where
        U: TS,
        H: Handler<Extractors, AppState> + Clone + Send + 'static,
        Extractors: HasJsonPayload<U> + 'static,
    {
        EntityDef {
            shape: self.shape,
            base_route: self.base_route,
            id_route: self.id_route.patch(handler),
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
            mutations_url: format!("/v1/{}", self.shape.table()),
            row_type: E::name(),
            create_type: C::maybe_name(),
            update_type: U::maybe_name(),
        }
    }
}
