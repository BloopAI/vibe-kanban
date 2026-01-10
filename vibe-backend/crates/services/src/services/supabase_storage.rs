use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum SupabaseStorageError {
    #[error("HTTP error: {0}")]
    Http(String),
    #[error("Supabase API error: {0}")]
    Api(String),
    #[error("File not found: {0}")]
    NotFound(String),
    #[error("Upload failed: {0}")]
    UploadFailed(String),
    #[error("Configuration error: {0}")]
    Config(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
}

/// Result of uploading a file to Supabase Storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadResult {
    /// The storage key (path in bucket)
    pub key: String,
    /// The bucket name
    pub bucket: String,
    /// File size in bytes
    pub size: i64,
    /// MIME type
    pub mime_type: String,
    /// Storage metadata from Supabase
    pub metadata: Option<StorageMetadata>,
}

/// Metadata returned by Supabase Storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageMetadata {
    /// Entity tag for caching
    pub etag: Option<String>,
    /// Last modification time (ISO 8601)
    pub last_modified: Option<String>,
    /// Content type
    pub content_type: Option<String>,
    /// Cache control header
    pub cache_control: Option<String>,
}

/// Signed URL result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedUrlResult {
    /// The signed URL for temporary access
    pub url: String,
    /// Time until expiry in seconds
    pub expires_in: u64,
}

/// Generate a storage key for a document
///
/// Format:
/// - Root level: `{team_id}/root/{uuid}_{filename}`
/// - In folder: `{team_id}/folders/{folder_id}/{uuid}_{filename}`
pub fn generate_storage_key(
    team_id: Uuid,
    folder_id: Option<Uuid>,
    filename: &str,
) -> String {
    let file_uuid = Uuid::new_v4();
    let sanitized_filename = sanitize_filename(filename);

    match folder_id {
        Some(fid) => format!("{}/folders/{}/{}_{}", team_id, fid, file_uuid, sanitized_filename),
        None => format!("{}/root/{}_{}", team_id, file_uuid, sanitized_filename),
    }
}

/// Sanitize a filename for use in storage paths
/// Replaces spaces and special characters with underscores
pub fn sanitize_filename(filename: &str) -> String {
    filename
        .chars()
        .map(|c| match c {
            // Keep alphanumeric, dots, dashes, and underscores
            c if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' => c,
            // Replace spaces with underscores
            ' ' => '_',
            // Replace parentheses
            '(' | ')' => '_',
            // Remove other characters
            _ => '_',
        })
        .collect::<String>()
        // Remove consecutive underscores
        .split('_')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

/// Get MIME type from file extension
pub fn get_mime_type(extension: &str) -> &'static str {
    match extension.to_lowercase().as_str() {
        "md" | "markdown" => "text/markdown",
        "txt" => "text/plain",
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "csv" => "text/csv",
        "json" => "application/json",
        "xml" => "application/xml",
        "html" | "htm" => "text/html",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

/// Supabase Storage client for file operations
#[derive(Clone)]
pub struct SupabaseStorageClient {
    /// Supabase project URL
    url: String,
    /// Service role key for server-side operations
    service_key: String,
    /// Default bucket name
    bucket: String,
    /// HTTP client
    client: reqwest::Client,
}

impl SupabaseStorageClient {
    /// Create a new Supabase Storage client
    pub fn new(url: &str, service_key: &str, bucket: &str) -> Result<Self, SupabaseStorageError> {
        if url.is_empty() {
            return Err(SupabaseStorageError::Config("Supabase URL is required".to_string()));
        }
        if service_key.is_empty() {
            return Err(SupabaseStorageError::Config("Service key is required".to_string()));
        }
        if bucket.is_empty() {
            return Err(SupabaseStorageError::Config("Bucket name is required".to_string()));
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| SupabaseStorageError::Http(e.to_string()))?;

        Ok(Self {
            url: url.trim_end_matches('/').to_string(),
            service_key: service_key.to_string(),
            bucket: bucket.to_string(),
            client,
        })
    }

    /// Create client from environment variables
    pub fn from_env() -> Result<Self, SupabaseStorageError> {
        let url = std::env::var("SUPABASE_URL")
            .map_err(|_| SupabaseStorageError::Config("SUPABASE_URL not set".to_string()))?;
        let service_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
            .map_err(|_| SupabaseStorageError::Config("SUPABASE_SERVICE_ROLE_KEY not set".to_string()))?;
        let bucket = std::env::var("SUPABASE_STORAGE_BUCKET")
            .unwrap_or_else(|_| "ikanban-bucket".to_string());

        Self::new(&url, &service_key, &bucket)
    }

    /// Get storage API base URL
    fn storage_url(&self) -> String {
        format!("{}/storage/v1", self.url)
    }

    /// Upload a file to Supabase Storage
    pub async fn upload(
        &self,
        team_id: Uuid,
        folder_id: Option<Uuid>,
        filename: &str,
        content: Vec<u8>,
        mime_type: &str,
    ) -> Result<UploadResult, SupabaseStorageError> {
        let storage_key = generate_storage_key(team_id, folder_id, filename);
        let url = format!(
            "{}/object/{}/{}",
            self.storage_url(),
            self.bucket,
            storage_key
        );

        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.service_key))
            .header("Content-Type", mime_type)
            .header("x-upsert", "true")
            .body(content.clone())
            .send()
            .await
            .map_err(|e| SupabaseStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(SupabaseStorageError::UploadFailed(format!(
                "Status {}: {}",
                status, error_body
            )));
        }

        Ok(UploadResult {
            key: storage_key,
            bucket: self.bucket.clone(),
            size: content.len() as i64,
            mime_type: mime_type.to_string(),
            metadata: None,
        })
    }

    /// Download a file from Supabase Storage
    pub async fn download(&self, storage_key: &str) -> Result<Vec<u8>, SupabaseStorageError> {
        let url = format!(
            "{}/object/{}/{}",
            self.storage_url(),
            self.bucket,
            storage_key
        );

        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.service_key))
            .send()
            .await
            .map_err(|e| SupabaseStorageError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(SupabaseStorageError::NotFound(storage_key.to_string()));
        }

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(SupabaseStorageError::Api(format!(
                "Status {}: {}",
                status, error_body
            )));
        }

        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| SupabaseStorageError::Http(e.to_string()))
    }

    /// Delete a file from Supabase Storage
    pub async fn delete(&self, storage_key: &str) -> Result<(), SupabaseStorageError> {
        let url = format!(
            "{}/object/{}/{}",
            self.storage_url(),
            self.bucket,
            storage_key
        );

        let response = self.client
            .delete(&url)
            .header("Authorization", format!("Bearer {}", self.service_key))
            .send()
            .await
            .map_err(|e| SupabaseStorageError::Http(e.to_string()))?;

        // 404 is OK for delete (idempotent)
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(SupabaseStorageError::Api(format!(
                "Status {}: {}",
                status, error_body
            )));
        }

        Ok(())
    }

    /// Generate a signed URL for temporary file access (Download)
    pub async fn create_signed_url(
        &self,
        storage_key: &str,
        expires_in_seconds: u64,
    ) -> Result<SignedUrlResult, SupabaseStorageError> {
        let url = format!(
            "{}/object/sign/{}/{}",
            self.storage_url(),
            self.bucket,
            storage_key
        );

        let body = serde_json::json!({
            "expiresIn": expires_in_seconds
        });

        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.service_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| SupabaseStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(SupabaseStorageError::Api(format!(
                "Status {}: {}",
                status, error_body
            )));
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct SignedUrlResponse {
            signed_url: String,
        }

        let result: SignedUrlResponse = response
            .json()
            .await
            .map_err(|e| SupabaseStorageError::Serialization(e.to_string()))?;

        // The signed URL is relative, prepend the storage URL
        let full_url = if result.signed_url.starts_with("http") {
            result.signed_url
        } else {
            format!("{}{}", self.storage_url(), result.signed_url)
        };

        Ok(SignedUrlResult {
            url: full_url,
            expires_in: expires_in_seconds,
        })
    }

    /// Generate a signed URL for uploading a file
    pub async fn create_signed_upload_url(
        &self,
        storage_key: &str,
    ) -> Result<SignedUrlResult, SupabaseStorageError> {
        let url = format!(
            "{}/object/upload/sign/{}/{}",
            self.storage_url(),
            self.bucket,
            storage_key
        );

        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.service_key))
            .send()
            .await
            .map_err(|e| SupabaseStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(SupabaseStorageError::Api(format!(
                "Status {}: {}",
                status, error_body
            )));
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct SignedUploadUrlResponse {
            url: String,
        }

        let result: SignedUploadUrlResponse = response
            .json()
            .await
            .map_err(|e| SupabaseStorageError::Serialization(e.to_string()))?;

        // Supabase returns the full URL with token for uploads usually
        let full_url = if result.url.starts_with("http") {
            result.url
        } else {
             format!("{}{}", self.storage_url(), result.url)
        };

        Ok(SignedUrlResult {
            url: full_url,
            expires_in: 3600, // Default to 1 hour (unspecified in response usually)
        })
    }

    /// Get a public URL for a file (if bucket is public)
    pub fn get_public_url(&self, storage_key: &str) -> String {
        format!(
            "{}/object/public/{}/{}",
            self.storage_url(),
            self.bucket,
            storage_key
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_storage_key_root() {
        let team_id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let key = generate_storage_key(team_id, None, "test-doc.pdf");

        assert!(key.starts_with(&format!("{}/root/", team_id)));
        assert!(key.ends_with("_test-doc.pdf"));
        // Check that UUID is in the middle
        let parts: Vec<&str> = key.split('/').collect();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0], team_id.to_string());
        assert_eq!(parts[1], "root");
    }

    #[test]
    fn test_generate_storage_key_folder() {
        let team_id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let folder_id = Uuid::parse_str("660e8400-e29b-41d4-a716-446655440000").unwrap();
        let key = generate_storage_key(team_id, Some(folder_id), "report.xlsx");

        assert!(key.starts_with(&format!("{}/folders/{}/", team_id, folder_id)));
        assert!(key.ends_with("_report.xlsx"));
        // Check structure
        let parts: Vec<&str> = key.split('/').collect();
        assert_eq!(parts.len(), 4);
        assert_eq!(parts[0], team_id.to_string());
        assert_eq!(parts[1], "folders");
        assert_eq!(parts[2], folder_id.to_string());
    }

    #[test]
    fn test_sanitize_filename_spaces() {
        assert_eq!(sanitize_filename("test file.pdf"), "test_file.pdf");
    }

    #[test]
    fn test_sanitize_filename_special_chars() {
        assert_eq!(sanitize_filename("test/path.pdf"), "test_path.pdf");
        assert_eq!(sanitize_filename("test\\path.pdf"), "test_path.pdf");
    }

    #[test]
    fn test_sanitize_filename_parentheses() {
        // Parentheses are replaced with underscores
        // "Test File (1).pdf" -> "Test_File_1_.pdf" (underscore before dot remains)
        assert_eq!(sanitize_filename("Test File (1).pdf"), "Test_File_1_.pdf");
    }

    #[test]
    fn test_sanitize_filename_multiple_spaces() {
        assert_eq!(sanitize_filename("test   file.pdf"), "test_file.pdf");
    }

    #[test]
    fn test_sanitize_filename_preserves_extension() {
        assert_eq!(sanitize_filename("document.pdf"), "document.pdf");
        assert_eq!(sanitize_filename("image.PNG"), "image.PNG");
    }

    #[test]
    fn test_get_mime_type_common_types() {
        assert_eq!(get_mime_type("pdf"), "application/pdf");
        assert_eq!(get_mime_type("md"), "text/markdown");
        assert_eq!(get_mime_type("txt"), "text/plain");
        assert_eq!(get_mime_type("json"), "application/json");
        assert_eq!(get_mime_type("png"), "image/png");
        assert_eq!(get_mime_type("jpg"), "image/jpeg");
        assert_eq!(get_mime_type("jpeg"), "image/jpeg");
    }

    #[test]
    fn test_get_mime_type_case_insensitive() {
        assert_eq!(get_mime_type("PDF"), "application/pdf");
        assert_eq!(get_mime_type("Pdf"), "application/pdf");
    }

    #[test]
    fn test_get_mime_type_unknown() {
        assert_eq!(get_mime_type("xyz"), "application/octet-stream");
    }

    #[test]
    fn test_client_requires_url() {
        let result = SupabaseStorageClient::new("", "key", "bucket");
        assert!(result.is_err());
    }

    #[test]
    fn test_client_requires_key() {
        let result = SupabaseStorageClient::new("http://example.com", "", "bucket");
        assert!(result.is_err());
    }

    #[test]
    fn test_client_requires_bucket() {
        let result = SupabaseStorageClient::new("http://example.com", "key", "");
        assert!(result.is_err());
    }

    #[test]
    fn test_client_creation_success() {
        let result = SupabaseStorageClient::new(
            "https://example.supabase.co",
            "service-role-key",
            "ikanban-bucket"
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_storage_url_format() {
        let client = SupabaseStorageClient::new(
            "https://example.supabase.co",
            "key",
            "bucket"
        ).unwrap();

        assert_eq!(client.storage_url(), "https://example.supabase.co/storage/v1");
    }

    #[test]
    fn test_public_url_format() {
        let client = SupabaseStorageClient::new(
            "https://example.supabase.co",
            "key",
            "ikanban-bucket"
        ).unwrap();

        let url = client.get_public_url("team123/root/abc_test.pdf");
        assert_eq!(
            url,
            "https://example.supabase.co/storage/v1/object/public/ikanban-bucket/team123/root/abc_test.pdf"
        );
    }
}
