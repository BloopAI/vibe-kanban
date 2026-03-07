use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(crate) struct ApiResponseEnvelope<T> {
    pub(crate) success: bool,
    pub(crate) data: Option<T>,
    pub(crate) message: Option<String>,
}

pub mod task_server;
