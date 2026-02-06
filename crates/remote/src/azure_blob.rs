use std::time::Duration;

use azure_core::auth::Secret;
use azure_storage::prelude::*;
use azure_storage::shared_access_signature::{
    service_sas::{BlobSasPermissions, BlobSharedAccessSignature, BlobSignedResource, SasKey},
    SasProtocol, SasToken,
};
use azure_storage::CloudLocation;
use azure_storage_blobs::prelude::*;
use chrono::{DateTime, Utc};
use futures::StreamExt;
use secrecy::ExposeSecret;
use time::OffsetDateTime;

use crate::config::AzureBlobConfig;

#[derive(Clone)]
pub struct AzureBlobService {
    blob_service_client: BlobServiceClient,
    account_name: String,
    account_key: String,
    container_name: String,
    endpoint_url: Option<String>,
    public_endpoint_url: Option<String>,
    presign_expiry: Duration,
}

#[derive(Debug)]
pub struct PresignedUpload {
    pub upload_url: String,
    pub blob_path: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct BlobProperties {
    pub content_length: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum AzureBlobError {
    #[error("azure storage error: {0}")]
    Storage(String),
    #[error("blob not found: {0}")]
    NotFound(String),
    #[error("SAS token error: {0}")]
    SasToken(String),
}

impl AzureBlobService {
    pub fn new(config: &AzureBlobConfig) -> Self {
        let account_name = config.account_name.clone();
        let account_key = config.account_key.expose_secret().to_string();
        let container_name = config.container_name.clone();
        let endpoint_url = config.endpoint_url.clone();
        let public_endpoint_url = config.public_endpoint_url.clone();
        let presign_expiry = Duration::from_secs(config.presign_expiry_secs);

        let storage_credentials = StorageCredentials::access_key(
            account_name.clone(),
            Secret::new(account_key.clone()),
        );

        let blob_service_client = match &endpoint_url {
            Some(endpoint) => ClientBuilder::with_location(
                CloudLocation::Custom {
                    account: account_name.clone(),
                    uri: endpoint.clone(),
                },
                storage_credentials,
            )
            .blob_service_client(),
            None => BlobServiceClient::new(account_name.clone(), storage_credentials),
        };

        Self {
            blob_service_client,
            account_name,
            account_key,
            container_name,
            endpoint_url,
            public_endpoint_url,
            presign_expiry,
        }
    }

    fn container_client(&self) -> ContainerClient {
        self.blob_service_client
            .container_client(&self.container_name)
    }

    fn blob_client(&self, blob_path: &str) -> BlobClient {
        self.container_client().blob_client(blob_path)
    }

    pub fn create_upload_url(&self, blob_path: &str) -> Result<PresignedUpload, AzureBlobError> {
        let expiry_chrono = Utc::now()
            + chrono::Duration::from_std(self.presign_expiry)
                .unwrap_or(chrono::Duration::hours(1));

        let permissions = BlobSasPermissions {
            create: true,
            write: true,
            ..Default::default()
        };

        let sas_url = self.generate_sas_url(blob_path, permissions, expiry_chrono)?;

        Ok(PresignedUpload {
            upload_url: sas_url,
            blob_path: blob_path.to_string(),
            expires_at: expiry_chrono,
        })
    }

    pub fn create_read_url(&self, blob_path: &str) -> Result<String, AzureBlobError> {
        let expiry = Utc::now() + chrono::Duration::minutes(5);

        let permissions = BlobSasPermissions {
            read: true,
            ..Default::default()
        };

        self.generate_sas_url(blob_path, permissions, expiry)
    }

    pub async fn get_blob_properties(&self, blob_path: &str) -> Result<BlobProperties, AzureBlobError> {
        let blob_client = self.blob_client(blob_path);
        let props = blob_client
            .get_properties()
            .await
            .map_err(|e| AzureBlobError::Storage(e.to_string()))?;

        Ok(BlobProperties {
            content_length: props.blob.properties.content_length as i64,
        })
    }

    pub async fn download_blob(&self, blob_path: &str) -> Result<Vec<u8>, AzureBlobError> {
        let blob_client = self.blob_client(blob_path);

        let mut stream = blob_client.get().into_stream();
        let mut result = Vec::new();

        while let Some(value) = stream.next().await {
            let response = value.map_err(|e| AzureBlobError::Storage(e.to_string()))?;
            let mut body = response.data;
            while let Some(chunk) = body.next().await {
                let chunk = chunk.map_err(|e| AzureBlobError::Storage(e.to_string()))?;
                result.extend(&chunk);
            }
        }

        if result.is_empty() {
            return Err(AzureBlobError::NotFound(blob_path.to_string()));
        }

        Ok(result)
    }

    pub async fn upload_blob(
        &self,
        blob_path: &str,
        data: Vec<u8>,
        content_type: String,
    ) -> Result<(), AzureBlobError> {
        let blob_client = self.blob_client(blob_path);

        blob_client
            .put_block_blob(data)
            .content_type(content_type)
            .await
            .map_err(|e| AzureBlobError::Storage(e.to_string()))?;

        Ok(())
    }

    pub async fn delete_blob(&self, blob_path: &str) -> Result<(), AzureBlobError> {
        self.blob_client(blob_path)
            .delete()
            .await
            .map_err(|e| AzureBlobError::Storage(e.to_string()))?;

        Ok(())
    }

    fn generate_sas_url(
        &self,
        blob_path: &str,
        permissions: BlobSasPermissions,
        expiry: DateTime<Utc>,
    ) -> Result<String, AzureBlobError> {
        let expiry_time = OffsetDateTime::from_unix_timestamp(expiry.timestamp())
            .map_err(|e| AzureBlobError::SasToken(e.to_string()))?;

        let canonicalized_resource = format!(
            "/blob/{}/{}/{}",
            self.account_name, self.container_name, blob_path
        );

        let protocol = match &self.endpoint_url {
            Some(url) if url.starts_with("http://") => SasProtocol::HttpHttps,
            _ => SasProtocol::Https,
        };

        let sas = BlobSharedAccessSignature::new(
            SasKey::Key(Secret::new(self.account_key.clone())),
            canonicalized_resource,
            permissions,
            expiry_time,
            BlobSignedResource::Blob,
        )
        .protocol(protocol);

        let token = sas
            .token()
            .map_err(|e| AzureBlobError::SasToken(e.to_string()))?;

        let base_url = match (&self.public_endpoint_url, &self.endpoint_url) {
            (Some(public), _) => public.trim_end_matches('/').to_string(),
            (None, Some(endpoint)) => endpoint.trim_end_matches('/').to_string(),
            (None, None) => format!("https://{}.blob.core.windows.net", self.account_name),
        };

        Ok(format!(
            "{}/{}/{}?{}",
            base_url, self.container_name, blob_path, token
        ))
    }

    /// List all blobs in the container whose path starts with `prefix`.
    pub async fn list_blobs_with_prefix(
        &self,
        prefix: &str,
    ) -> Result<Vec<BlobListItem>, AzureBlobError> {
        let mut items = Vec::new();
        let mut stream = self
            .container_client()
            .list_blobs()
            .prefix(prefix.to_string())
            .into_stream();

        while let Some(response) = stream.next().await {
            let response = response.map_err(|e| AzureBlobError::Storage(e.to_string()))?;
            for blob in response.blobs.blobs() {
                items.push(BlobListItem {
                    name: blob.name.clone(),
                    last_modified: blob.properties.last_modified,
                });
            }
        }

        Ok(items)
    }
}

#[derive(Debug)]
pub struct BlobListItem {
    pub name: String,
    pub last_modified: OffsetDateTime,
}
