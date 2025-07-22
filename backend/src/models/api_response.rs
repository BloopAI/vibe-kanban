mod response {
    use serde::{Deserialize, Serialize};
    use ts_rs::TS;

    #[derive(Debug, Serialize, Deserialize, TS)]
    #[ts(export)]
    pub struct ApiResponse<T> {
        pub success: bool,
        pub data: Option<T>,
        pub message: Option<String>,
    }

    impl<T> ApiResponse<T> {
        /// Creates a successful response, with `data` and no message.
        pub fn success(data: T) -> Self {
            ApiResponse {
                success: true,
                data: Some(data),
                message: None,
            }
        }

        /// Creates an error response, with `message` and no data.
        pub fn error(message: &str) -> Self {
            ApiResponse {
                success: false,
                data: None,
                message: Some(message.to_string()),
            }
        }
    }
}

// Re-export the type with public fields
pub use response::ApiResponse;
