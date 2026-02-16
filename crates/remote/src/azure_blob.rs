use std::{fmt, sync::Arc, time::Duration};

use azure_core::{
    credentials::Secret,
    http::{ClientOptions, RequestContent},
};
use azure_identity::{ManagedIdentityCredential, ManagedIdentityCredentialOptions, UserAssignedId};
use azure_storage_blob::{
    BlobClient, BlobContainerClient, BlobServiceClient, BlobServiceClientOptions,
    models::{BlobClientGetPropertiesResultHeaders, BlockBlobClientUploadOptions},
};
use base64::prelude::*;
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use secrecy::ExposeSecret;
use sha2::Sha256;
use time::OffsetDateTime;
use url::form_urlencoded;

use crate::{
    config::{AzureAuthMode, AzureBlobConfig},
    shared_key_auth::SharedKeyAuthorizationPolicy,
};

#[derive(Clone)]
pub struct AzureBlobService {
    service_client: Arc<BlobServiceClient>,
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

        let endpoint = match &endpoint_url {
            Some(url) => url.clone(),
            None => format!("https://{}.blob.core.windows.net", account_name),
        };

        let service_client = match &config.auth_mode {
            AzureAuthMode::EntraId { client_id } => {
                let credential =
                    ManagedIdentityCredential::new(Some(ManagedIdentityCredentialOptions {
                        user_assigned_id: Some(UserAssignedId::ClientId(client_id.clone())),
                        ..Default::default()
                    }))
                    .expect("failed to create ManagedIdentityCredential");

                Arc::new(
                    BlobServiceClient::new(&endpoint, Some(credential), None)
                        .expect("failed to create BlobServiceClient with managed identity"),
                )
            }
            AzureAuthMode::SharedKey => {
                let policy = Arc::new(SharedKeyAuthorizationPolicy {
                    account: account_name.clone(),
                    key: Secret::new(account_key.clone()),
                });

                Arc::new(
                    BlobServiceClient::new(
                        &endpoint,
                        None,
                        Some(BlobServiceClientOptions {
                            client_options: ClientOptions {
                                per_try_policies: vec![policy],
                                ..Default::default()
                            },
                            ..Default::default()
                        }),
                    )
                    .expect("failed to create BlobServiceClient with shared key"),
                )
            }
        };

        Self {
            service_client,
            account_name,
            account_key,
            container_name,
            endpoint_url,
            public_endpoint_url,
            presign_expiry,
        }
    }

    fn container_client(&self) -> BlobContainerClient {
        self.service_client
            .blob_container_client(&self.container_name)
    }

    fn blob_client(&self, blob_path: &str) -> BlobClient {
        self.container_client().blob_client(blob_path)
    }

    pub fn create_upload_url(&self, blob_path: &str) -> Result<PresignedUpload, AzureBlobError> {
        let expiry_chrono = Utc::now()
            + chrono::Duration::from_std(self.presign_expiry).unwrap_or(chrono::Duration::hours(1));

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

    pub async fn get_blob_properties(
        &self,
        blob_path: &str,
    ) -> Result<BlobProperties, AzureBlobError> {
        let response = self
            .blob_client(blob_path)
            .get_properties(None)
            .await
            .map_err(|e| AzureBlobError::Storage(e.to_string()))?;

        let content_length = response
            .content_length()
            .map_err(|e| AzureBlobError::Storage(e.to_string()))?
            .unwrap_or(0) as i64;

        Ok(BlobProperties { content_length })
    }

    pub async fn download_blob(&self, blob_path: &str) -> Result<Vec<u8>, AzureBlobError> {
        let response = self
            .blob_client(blob_path)
            .download(None)
            .await
            .map_err(|e| AzureBlobError::Storage(e.to_string()))?;

        let bytes = response
            .into_body()
            .collect()
            .await
            .map_err(|e| AzureBlobError::Storage(e.to_string()))?;

        if bytes.is_empty() {
            return Err(AzureBlobError::NotFound(blob_path.to_string()));
        }

        Ok(bytes.to_vec())
    }

    pub async fn upload_blob(
        &self,
        blob_path: &str,
        data: Vec<u8>,
        content_type: String,
    ) -> Result<(), AzureBlobError> {
        let len = data.len() as u64;

        self.blob_client(blob_path)
            .upload(
                RequestContent::from(data),
                true,
                len,
                Some(BlockBlobClientUploadOptions {
                    blob_content_type: Some(content_type),
                    ..Default::default()
                }),
            )
            .await
            .map_err(|e| AzureBlobError::Storage(e.to_string()))?;

        Ok(())
    }

    pub async fn delete_blob(&self, blob_path: &str) -> Result<(), AzureBlobError> {
        self.blob_client(blob_path)
            .delete(None)
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
            Secret::new(self.account_key.clone()),
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
}

// ── SAS token generation (ported from azure_storage 0.21) ────────────────────
//
// https://github.com/Azure/azure-sdk-for-rust/blob/legacy/sdk/storage/src/shared_access_signature/mod.rs
//
// This crate has been deprecated by Azure, but SAS token generation has yet to be implemented in
// the new azure_storage_blob crate, so we port the relevant code here for now.
//
// See: https://github.com/Azure/azure-sdk-for-rust/issues/3330

const SERVICE_SAS_VERSION: &str = "2022-11-02";

#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum SasProtocol {
    Https,
    HttpHttps,
}

impl fmt::Display for SasProtocol {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            SasProtocol::Https => write!(f, "https"),
            SasProtocol::HttpHttps => write!(f, "http,https"),
        }
    }
}

pub enum BlobSignedResource {
    Blob,
    BlobVersion,
    BlobSnapshot,
    Container,
    Directory,
}

impl fmt::Display for BlobSignedResource {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Blob => write!(f, "b"),
            Self::BlobVersion => write!(f, "bv"),
            Self::BlobSnapshot => write!(f, "bs"),
            Self::Container => write!(f, "c"),
            Self::Directory => write!(f, "d"),
        }
    }
}

#[allow(clippy::struct_excessive_bools)]
#[derive(Default)]
pub struct BlobSasPermissions {
    pub read: bool,
    pub add: bool,
    pub create: bool,
    pub write: bool,
    pub delete: bool,
    pub delete_version: bool,
    pub permanent_delete: bool,
    pub list: bool,
    pub tags: bool,
    pub move_: bool,
    pub execute: bool,
    pub ownership: bool,
    pub permissions: bool,
}

impl fmt::Display for BlobSasPermissions {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        if self.read {
            write!(f, "r")?;
        }
        if self.add {
            write!(f, "a")?;
        }
        if self.create {
            write!(f, "c")?;
        }
        if self.write {
            write!(f, "w")?;
        }
        if self.delete {
            write!(f, "d")?;
        }
        if self.delete_version {
            write!(f, "x")?;
        }
        if self.permanent_delete {
            write!(f, "y")?;
        }
        if self.list {
            write!(f, "l")?;
        }
        if self.tags {
            write!(f, "t")?;
        }
        if self.move_ {
            write!(f, "m")?;
        }
        if self.execute {
            write!(f, "e")?;
        }
        if self.ownership {
            write!(f, "o")?;
        }
        if self.permissions {
            write!(f, "p")?;
        }
        Ok(())
    }
}

pub struct BlobSharedAccessSignature {
    key: Secret,
    canonicalized_resource: String,
    resource: BlobSignedResource,
    permissions: BlobSasPermissions,
    expiry: OffsetDateTime,
    protocol: Option<SasProtocol>,
}

impl BlobSharedAccessSignature {
    pub fn new(
        key: Secret,
        canonicalized_resource: String,
        permissions: BlobSasPermissions,
        expiry: OffsetDateTime,
        resource: BlobSignedResource,
    ) -> Self {
        Self {
            key,
            canonicalized_resource,
            resource,
            permissions,
            expiry,
            protocol: None,
        }
    }

    pub fn protocol(mut self, protocol: SasProtocol) -> Self {
        self.protocol = Some(protocol);
        self
    }

    fn sign(&self) -> String {
        let content = [
            self.permissions.to_string(),
            String::new(), // start time
            format_sas_date(self.expiry),
            self.canonicalized_resource.clone(),
            String::new(), // identifier
            String::new(), // ip
            self.protocol.map(|x| x.to_string()).unwrap_or_default(),
            SERVICE_SAS_VERSION.to_string(),
            self.resource.to_string(),
            String::new(), // snapshot time
            String::new(), // signed encryption scope
            String::new(), // signed cache control
            String::new(), // signed content disposition
            String::new(), // signed content encoding
            String::new(), // signed content language
            String::new(), // signed content type
        ];

        sas_hmac_sha256(&content.join("\n"), &self.key)
    }

    pub fn token(&self) -> Result<String, AzureBlobError> {
        let mut form = form_urlencoded::Serializer::new(String::new());

        form.extend_pairs(&[
            ("sv", SERVICE_SAS_VERSION),
            ("sp", &self.permissions.to_string()),
            ("sr", &self.resource.to_string()),
            ("se", &format_sas_date(self.expiry)),
        ]);

        if let Some(protocol) = &self.protocol {
            form.append_pair("spr", &protocol.to_string());
        }

        let sig = self.sign();
        form.append_pair("sig", &sig);
        Ok(form.finish())
    }
}

fn format_sas_date(d: OffsetDateTime) -> String {
    // Truncate nanoseconds to match Azure's canonicalization.
    let d = d.replace_nanosecond(0).unwrap();
    d.format(&time::format_description::well_known::Rfc3339)
        .unwrap()
}

fn sas_hmac_sha256(data: &str, key: &Secret) -> String {
    let key_bytes = BASE64_STANDARD.decode(key.secret()).unwrap();
    let mut hmac = Hmac::<Sha256>::new_from_slice(&key_bytes).unwrap();
    hmac.update(data.as_bytes());
    BASE64_STANDARD.encode(hmac.finalize().into_bytes())
}

#[cfg(test)]
mod tests {
    use time::Duration;

    use super::*;

    const MOCK_SECRET_KEY: &str = "RZfi3m1W7eyQ5zD4ymSmGANVdJ2SDQmg4sE89SW104s=";
    const MOCK_CANONICALIZED_RESOURCE: &str = "/blob/STORAGE_ACCOUNT_NAME/CONTAINER_NAME/";

    #[test]
    fn test_blob_scoped_sas_token() {
        let permissions = BlobSasPermissions {
            read: true,
            ..Default::default()
        };
        let signed_token = BlobSharedAccessSignature::new(
            Secret::new(MOCK_SECRET_KEY),
            String::from(MOCK_CANONICALIZED_RESOURCE),
            permissions,
            OffsetDateTime::UNIX_EPOCH + Duration::days(7),
            BlobSignedResource::Blob,
        )
        .token()
        .unwrap();

        assert_eq!(
            signed_token,
            "sv=2022-11-02&sp=r&sr=b&se=1970-01-08T00%3A00%3A00Z&sig=VRZjVZ1c%2FLz7IXCp17Sdx9%2BR9JDrnJdzE3NW56DMjNs%3D"
        );

        let parsed = url::form_urlencoded::parse(signed_token.as_bytes());
        assert!(parsed.clone().any(|(k, v)| k == "sr" && v == "b"));
        assert!(!parsed.clone().any(|(k, _)| k == "sdd"));
    }

    #[test]
    fn test_directory_scoped_sas_token() {
        let permissions = BlobSasPermissions {
            read: true,
            ..Default::default()
        };
        let signed_token = BlobSharedAccessSignature::new(
            Secret::new(MOCK_SECRET_KEY),
            String::from(MOCK_CANONICALIZED_RESOURCE),
            permissions,
            OffsetDateTime::UNIX_EPOCH + Duration::days(7),
            BlobSignedResource::Directory,
        )
        .token()
        .unwrap();

        // The directory test from the original just checks sr=d is present
        let parsed = url::form_urlencoded::parse(signed_token.as_bytes());
        assert!(parsed.clone().any(|(k, v)| k == "sr" && v == "d"));
    }
}
