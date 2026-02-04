//! Entity definition builder for type-safe route and metadata generation.
//!
//! This module provides `EntityDef2`, a builder that:
//! - Generates axum routers with URLs derived from the shape's table name
//! - Captures type information for TypeScript generation
//! - Uses marker traits to enforce request/entity type relationships
//!
//! # Example
//!
//! ```ignore
//! use crate::entity_def::EntityDef2;
//! use crate::entities::TAG_SHAPE;
//!
//! pub fn entity() -> EntityDef2<Tag, CreateTagRequest, UpdateTagRequest> {
//!     EntityDef2::new(&TAG_SHAPE)
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
// Marker Trait Implementations
// =============================================================================

use utils::api::entities::{
    CreateIssueRequest, CreateTagRequest, Issue, Tag, UpdateIssueRequest, UpdateTagRequest,
};

impl CreateRequestFor for CreateTagRequest {
    type Entity = Tag;
}

impl UpdateRequestFor for UpdateTagRequest {
    type Entity = Tag;
}

impl CreateRequestFor for CreateIssueRequest {
    type Entity = Issue;
}

impl UpdateRequestFor for UpdateIssueRequest {
    type Entity = Issue;
}

// =============================================================================
// EntityMeta - Metadata for TypeScript generation
// =============================================================================

/// Metadata extracted from an EntityDef2 for TypeScript code generation.
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
// EntityDef2 Builder
// =============================================================================

/// Builder for entity routes and metadata.
///
/// Type parameters:
/// - `E`: The entity/row type (e.g., `Tag`)
/// - `C`: The create request type, or `()` if no create
/// - `U`: The update request type, or `()` if no update
pub struct EntityDef2<E, C = (), U = ()> {
    shape: &'static dyn crate::shapes::ShapeExport,
    base_route: MethodRouter<AppState>,
    id_route: MethodRouter<AppState>,
    has_create: bool,
    has_update: bool,
    has_delete: bool,
    _phantom: PhantomData<fn() -> (E, C, U)>,
}

impl<E: TS + Send + Sync + 'static> EntityDef2<E, (), ()> {
    /// Create a new EntityDef2 from a shape definition.
    pub fn new(shape: &'static ShapeDefinition<E>) -> Self {
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

impl<E: TS, C, U> EntityDef2<E, C, U> {
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
        let id_path = format!("/{}/{{{}_id}}", table, singular(table));

        axum::Router::new()
            .route(&base_path, self.base_route)
            .route(&id_path, self.id_route)
    }
}

impl<E: TS, U> EntityDef2<E, (), U> {
    /// Add a create handler (POST /table).
    ///
    /// The create request type must implement `CreateRequestFor<Entity = E>`.
    pub fn create<C, H, T>(self, handler: H) -> EntityDef2<E, C, U>
    where
        C: TS + CreateRequestFor<Entity = E>,
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        EntityDef2 {
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

impl<E: TS, C> EntityDef2<E, C, ()> {
    /// Add an update handler (PATCH /table/{id}).
    ///
    /// The update request type must implement `UpdateRequestFor<Entity = E>`.
    pub fn update<U, H, T>(self, handler: H) -> EntityDef2<E, C, U>
    where
        U: TS + UpdateRequestFor<Entity = E>,
        H: Handler<T, AppState> + Clone + Send + 'static,
        T: 'static,
    {
        EntityDef2 {
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

// Metadata for entities with both create and update
impl<E: TS, C: TS, U: TS> EntityDef2<E, C, U> {
    /// Extract metadata for TypeScript generation.
    pub fn metadata(&self) -> EntityMeta {
        EntityMeta {
            table: self.shape.table(),
            shape_url: self.shape.url(),
            mutations_url: format!("/v1/{}", self.shape.table()),
            row_type: E::name(),
            create_type: if self.has_create {
                Some(C::name())
            } else {
                None
            },
            update_type: if self.has_update {
                Some(U::name())
            } else {
                None
            },
            has_delete: self.has_delete,
        }
    }
}

/// Convert a plural table name to singular for the ID path parameter.
/// e.g., "tags" -> "tag", "issues" -> "issue", "project_statuses" -> "project_status"
fn singular(table: &str) -> String {
    if table.ends_with("ies") {
        // e.g., "entries" -> "entry"
        format!("{}y", &table[..table.len() - 3])
    } else if table.ends_with("ses") || table.ends_with("xes") {
        // e.g., "statuses" -> "status", "boxes" -> "box"
        table[..table.len() - 2].to_string()
    } else if table.ends_with('s') {
        // e.g., "tags" -> "tag"
        table[..table.len() - 1].to_string()
    } else {
        table.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_singular() {
        assert_eq!(singular("tags"), "tag");
        assert_eq!(singular("issues"), "issue");
        assert_eq!(singular("project_statuses"), "project_status");
        assert_eq!(singular("entries"), "entry");
    }
}
