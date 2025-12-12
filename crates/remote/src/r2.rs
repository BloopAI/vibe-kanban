use std::time::Duration;

use aws_credential_types::Credentials;
use aws_sdk_s3::{
    Client,
    config::{Builder as S3ConfigBuilder, IdentityCache},
    presigning::PresigningConfig,
};
use chrono::{DateTime, Utc};
use secrecy::ExposeSecret;
use uuid::Uuid;

use crate::config::R2Config;

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
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, thiserror::Error)]
pub enum R2Error {
    #[error("presign config error: {0}")]
    PresignConfig(String),
    #[error("presign error: {0}")]
    Presign(String),
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
        content_type: Option<&str>,
    ) -> Result<PresignedUpload, R2Error> {
        let date = Utc::now().format("%Y-%m-%d");
        let uuid = Uuid::new_v4();
        let object_key = format!("reviews/{date}/{uuid}.tar.gz");

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
            expires_at,
        })
    }
}
