use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(crate) struct ApiResponseEnvelope<T> {
    pub(crate) success: bool,
    pub(crate) data: Option<T>,
    pub(crate) message: Option<String>,
}

pub mod runtime;
pub mod task_server;
