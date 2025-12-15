use std::time::Duration;

use aws_credential_types::Credentials;
use aws_sdk_s3::{
    Client,
    config::{Builder as S3ConfigBuilder, IdentityCache},
    presigning::PresigningConfig,
    primitives::ByteStream,
};
use chrono::{DateTime, Utc};
use secrecy::ExposeSecret;
use uuid::Uuid;

use crate::config::R2Config;

/// Well-known filename for the payload tarball stored in each review folder.
pub const PAYLOAD_FILENAME: &str = "payload.tar.gz";

#[derive(Clone)]
pub struct R2Service {
    client: Client,
    bucket: String,
    presign_expiry: Duration,
}

#[derive(Debug)]
pub struct PresignedUpload {
    pub upload_url: String,
    pub object_key: String,
    /// Folder path in R2 (e.g., "reviews/{review_id}") - this is stored in the database.
    pub folder_path: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, thiserror::Error)]
pub enum R2Error {
    #[error("presign config error: {0}")]
    PresignConfig(String),
    #[error("presign error: {0}")]
    Presign(String),
    #[error("upload error: {0}")]
    Upload(String),
}

impl R2Service {
    pub fn new(config: &R2Config) -> Self {
        let credentials = Credentials::new(
            &config.access_key_id,
            config.secret_access_key.expose_secret(),
            None,
            None,
            "r2-static",
        );

        let s3_config =
            S3ConfigBuilder::new()
                .region(aws_sdk_s3::config::Region::new("auto"))
                .endpoint_url(&config.endpoint)
                .credentials_provider(credentials)
                .force_path_style(true)
                .stalled_stream_protection(
                    aws_sdk_s3::config::StalledStreamProtectionConfig::disabled(),
                )
                .identity_cache(IdentityCache::no_cache())
                .build();

        let client = Client::from_conf(s3_config);

        Self {
            client,
            bucket: config.bucket.clone(),
            presign_expiry: Duration::from_secs(config.presign_expiry_secs),
        }
    }

    pub async fn create_presigned_upload(
        &self,
        review_id: Uuid,
        content_type: Option<&str>,
    ) -> Result<PresignedUpload, R2Error> {
        let folder_path = format!("reviews/{review_id}");
        let object_key = format!("{folder_path}/{PAYLOAD_FILENAME}");

        let presigning_config = PresigningConfig::builder()
            .expires_in(self.presign_expiry)
            .build()
            .map_err(|e| R2Error::PresignConfig(e.to_string()))?;

        let mut request = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(&object_key);

        if let Some(ct) = content_type {
            request = request.content_type(ct);
        }

        let presigned = request
            .presigned(presigning_config)
            .await
            .map_err(|e| R2Error::Presign(e.to_string()))?;

        let expires_at = Utc::now()
            + chrono::Duration::from_std(self.presign_expiry).unwrap_or(chrono::Duration::hours(1));

        Ok(PresignedUpload {
            upload_url: presigned.uri().to_string(),
            object_key,
            folder_path,
            expires_at,
        })
    }

    /// Upload bytes directly to R2 (for server-side uploads).
    ///
    /// Returns the folder path (e.g., "reviews/{review_id}") to store in the database.
    pub async fn upload_bytes(&self, review_id: Uuid, data: Vec<u8>) -> Result<String, R2Error> {
        let folder_path = format!("reviews/{review_id}");
        let object_key = format!("{folder_path}/{PAYLOAD_FILENAME}");

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&object_key)
            .body(ByteStream::from(data))
            .content_type("application/gzip")
            .send()
            .await
            .map_err(|e| R2Error::Upload(e.to_string()))?;

        Ok(folder_path)
    }
}
