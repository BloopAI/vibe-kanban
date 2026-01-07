//! Bitbucket Server credential management.
//!
//! Handles secure storage of Bitbucket Server HTTP access tokens,
//! with support for both file-based and macOS Keychain storage.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// Bitbucket Server credentials containing the HTTP access token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitbucketCredentials {
    /// HTTP access token for Bitbucket Server API
    pub access_token: String,
    /// Base URL for the Bitbucket Server instance
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredCredentials {
    access_token: String,
    base_url: String,
}

impl From<StoredCredentials> for BitbucketCredentials {
    fn from(value: StoredCredentials) -> Self {
        Self {
            access_token: value.access_token,
            base_url: value.base_url,
        }
    }
}

/// Service for managing Bitbucket Server credentials in memory and persistent storage.
pub struct BitbucketCredentialStore {
    backend: Backend,
    inner: RwLock<Option<BitbucketCredentials>>,
}

impl BitbucketCredentialStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            backend: Backend::detect(path),
            inner: RwLock::new(None),
        }
    }

    /// Get the default path for storing Bitbucket credentials
    pub fn default_path() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".vibe-kanban")
            .join("bitbucket_credentials.json")
    }

    pub async fn load(&self) -> std::io::Result<()> {
        let creds = self.backend.load().await?.map(BitbucketCredentials::from);
        *self.inner.write().await = creds;
        Ok(())
    }

    pub async fn save(&self, creds: &BitbucketCredentials) -> std::io::Result<()> {
        let stored = StoredCredentials {
            access_token: creds.access_token.clone(),
            base_url: creds.base_url.clone(),
        };
        self.backend.save(&stored).await?;
        *self.inner.write().await = Some(creds.clone());
        Ok(())
    }

    pub async fn clear(&self) -> std::io::Result<()> {
        self.backend.clear().await?;
        *self.inner.write().await = None;
        Ok(())
    }

    pub async fn get(&self) -> Option<BitbucketCredentials> {
        self.inner.read().await.clone()
    }

    /// Check if credentials are configured
    pub async fn is_configured(&self) -> bool {
        self.inner.read().await.is_some()
    }
}

trait StoreBackend {
    async fn load(&self) -> std::io::Result<Option<StoredCredentials>>;
    async fn save(&self, creds: &StoredCredentials) -> std::io::Result<()>;
    async fn clear(&self) -> std::io::Result<()>;
}

enum Backend {
    File(FileBackend),
    #[cfg(target_os = "macos")]
    Keychain(KeychainBackend),
}

impl Backend {
    fn detect(path: PathBuf) -> Self {
        #[cfg(target_os = "macos")]
        {
            let use_file = match std::env::var("BITBUCKET_CREDENTIALS_BACKEND") {
                Ok(v) if v.eq_ignore_ascii_case("file") => true,
                Ok(v) if v.eq_ignore_ascii_case("keychain") => false,
                _ => cfg!(debug_assertions),
            };
            if use_file {
                tracing::debug!("Bitbucket credentials backend: file");
                Backend::File(FileBackend { path })
            } else {
                tracing::debug!("Bitbucket credentials backend: keychain");
                Backend::Keychain(KeychainBackend)
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            tracing::debug!("Bitbucket credentials backend: file");
            Backend::File(FileBackend { path })
        }
    }
}

impl StoreBackend for Backend {
    async fn load(&self) -> std::io::Result<Option<StoredCredentials>> {
        match self {
            Backend::File(b) => b.load().await,
            #[cfg(target_os = "macos")]
            Backend::Keychain(b) => b.load().await,
        }
    }

    async fn save(&self, creds: &StoredCredentials) -> std::io::Result<()> {
        match self {
            Backend::File(b) => b.save(creds).await,
            #[cfg(target_os = "macos")]
            Backend::Keychain(b) => b.save(creds).await,
        }
    }

    async fn clear(&self) -> std::io::Result<()> {
        match self {
            Backend::File(b) => b.clear().await,
            #[cfg(target_os = "macos")]
            Backend::Keychain(b) => b.clear().await,
        }
    }
}

struct FileBackend {
    path: PathBuf,
}

impl FileBackend {
    async fn load(&self) -> std::io::Result<Option<StoredCredentials>> {
        if !self.path.exists() {
            return Ok(None);
        }

        let bytes = std::fs::read(&self.path)?;
        match serde_json::from_slice::<StoredCredentials>(&bytes) {
            Ok(creds) => Ok(Some(creds)),
            Err(e) => {
                tracing::warn!(?e, "failed to parse Bitbucket credentials file, renaming to .bad");
                let bad = self.path.with_extension("bad");
                let _ = std::fs::rename(&self.path, bad);
                Ok(None)
            }
        }
    }

    async fn save(&self, creds: &StoredCredentials) -> std::io::Result<()> {
        // Ensure parent directory exists
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let tmp = self.path.with_extension("tmp");

        let file = {
            let mut opts = std::fs::OpenOptions::new();
            opts.create(true).truncate(true).write(true);

            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                opts.mode(0o600);
            }

            opts.open(&tmp)?
        };

        serde_json::to_writer_pretty(&file, creds)?;
        file.sync_all()?;
        drop(file);

        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    async fn clear(&self) -> std::io::Result<()> {
        let _ = std::fs::remove_file(&self.path);
        Ok(())
    }
}

#[cfg(target_os = "macos")]
struct KeychainBackend;

#[cfg(target_os = "macos")]
impl KeychainBackend {
    const SERVICE_NAME: &'static str = "vibe-kanban:bitbucket";
    const ACCOUNT_NAME: &'static str = "default";
    const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

    async fn load(&self) -> std::io::Result<Option<StoredCredentials>> {
        use security_framework::passwords::get_generic_password;

        match get_generic_password(Self::SERVICE_NAME, Self::ACCOUNT_NAME) {
            Ok(bytes) => match serde_json::from_slice::<StoredCredentials>(&bytes) {
                Ok(creds) => Ok(Some(creds)),
                Err(error) => {
                    tracing::warn!(
                        ?error,
                        "failed to parse Bitbucket keychain credentials; ignoring entry"
                    );
                    Ok(None)
                }
            },
            Err(e) if e.code() == Self::ERR_SEC_ITEM_NOT_FOUND => Ok(None),
            Err(e) => Err(std::io::Error::other(e)),
        }
    }

    async fn save(&self, creds: &StoredCredentials) -> std::io::Result<()> {
        use security_framework::passwords::set_generic_password;

        let bytes = serde_json::to_vec_pretty(creds).map_err(std::io::Error::other)?;
        set_generic_password(Self::SERVICE_NAME, Self::ACCOUNT_NAME, &bytes)
            .map_err(std::io::Error::other)
    }

    async fn clear(&self) -> std::io::Result<()> {
        use security_framework::passwords::delete_generic_password;

        match delete_generic_password(Self::SERVICE_NAME, Self::ACCOUNT_NAME) {
            Ok(()) => Ok(()),
            Err(e) if e.code() == Self::ERR_SEC_ITEM_NOT_FOUND => Ok(()),
            Err(e) => Err(std::io::Error::other(e)),
        }
    }
}
