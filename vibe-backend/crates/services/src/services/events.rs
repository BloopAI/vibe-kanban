use std::sync::Arc;

use db::DBService;
use tokio::sync::RwLock;
use utils::msg_store::MsgStore;

#[path = "events/patches.rs"]
pub mod patches;
#[path = "events/streams.rs"]
mod streams;
#[path = "events/types.rs"]
pub mod types;

pub use patches::{
    execution_process_patch, project_patch, scratch_patch, task_patch, workspace_patch,
};
pub use types::{EventError, EventPatch, EventPatchInner, HookTables, RecordTypes};

#[derive(Clone)]
pub struct EventService {
    msg_store: Arc<MsgStore>,
    db: DBService,
    #[allow(dead_code)]
    entry_count: Arc<RwLock<usize>>,
}

impl EventService {
    /// Creates a new EventService
    pub fn new(db: DBService, msg_store: Arc<MsgStore>, entry_count: Arc<RwLock<usize>>) -> Self {
        Self {
            msg_store,
            db,
            entry_count,
        }
    }

    /// Creates the hook function that should be used with DBService::new_with_after_connect
    /// NOTE: Postgres does not support sqlite-style hooks. This is currently valid but does nothing.
    /// Realtime updates should be handled via app-level events or Postgres LISTEN/NOTIFY.
    pub fn create_hook(
        _msg_store: Arc<MsgStore>,
        _entry_count: Arc<RwLock<usize>>,
        _db_service: DBService,
    ) -> impl for<'a> Fn(
        &'a mut sqlx::PgConnection,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + 'a>,
    > + Send
    + Sync
    + 'static {
        move |_conn: &mut sqlx::PgConnection| {
            // No-op for Postgres migration
            Box::pin(async move {
                Ok(())
            })
        }
    }

    pub fn msg_store(&self) -> &Arc<MsgStore> {
        &self.msg_store
    }
}
