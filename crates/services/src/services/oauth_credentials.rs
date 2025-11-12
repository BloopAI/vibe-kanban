use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// OAuth credentials containing the JWT access token.
/// The access_token is a JWT from the remote OAuth service and should be treated as opaque.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub access_token: String,
}

/// Service for managing OAuth credentials (JWT tokens) in memory and persistent storage.
/// The token is loaded into memory on startup and persisted to disk/keychain on save.
pub struct OAuthCredentials {
    #[cfg_attr(target_os = "macos", allow(dead_code))]
    path: PathBuf,
    inner: RwLock<Option<Credentials>>,
}

impl OAuthCredentials {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            inner: RwLock::new(None),
        }
    }

    pub async fn load(&self) -> std::io::Result<()> {
        #[cfg(target_os = "macos")]
        {
            if use_file_backend() {
                tracing::info!("OAuth credentials backend: file");
                file_backend::load(self).await
            } else {
                tracing::info!("OAuth credentials backend: keychain");
                macos::load(self).await
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            file_backend::load(self).await
        }
    }

    pub async fn save(&self, creds: &Credentials) -> std::io::Result<()> {
        #[cfg(target_os = "macos")]
        {
            if use_file_backend() {
                file_backend::save(self, creds).await
            } else {
                macos::save(self, creds).await
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            file_backend::save(self, creds).await
        }
    }

    pub async fn clear(&self) -> std::io::Result<()> {
        #[cfg(target_os = "macos")]
        {
            if use_file_backend() {
                file_backend::clear(self).await
            } else {
                macos::clear(self).await
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            file_backend::clear(self).await
        }
    }

    pub async fn get(&self) -> Option<Credentials> {
        self.inner.read().await.clone()
    }
}

#[cfg(target_os = "macos")]
fn use_file_backend() -> bool {
    match std::env::var("OAUTH_CREDENTIALS_BACKEND") {
        Ok(v) if v.eq_ignore_ascii_case("file") => true,
        Ok(v) if v.eq_ignore_ascii_case("keychain") => false,
        _ => cfg!(debug_assertions),
    }
}

mod file_backend {
    use super::*;

    pub async fn load(oauth: &OAuthCredentials) -> std::io::Result<()> {
        if !oauth.path.exists() {
            return Ok(());
        }

        let bytes = std::fs::read(&oauth.path)?;
        match serde_json::from_slice::<Credentials>(&bytes) {
            Ok(creds) => {
                *oauth.inner.write().await = Some(creds);
                Ok(())
            }
            Err(e) => {
                tracing::warn!(?e, "failed to parse credentials file, renaming to .bad");
                let bad = oauth.path.with_extension("bad");
                let _ = std::fs::rename(&oauth.path, bad);
                Ok(())
            }
        }
    }

    pub async fn save(oauth: &OAuthCredentials, creds: &Credentials) -> std::io::Result<()> {
        let tmp = oauth.path.with_extension("tmp");

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

        serde_json::to_writer_pretty(&file, &creds)?;
        file.sync_all()?;
        drop(file);

        std::fs::rename(&tmp, &oauth.path)?;

        *oauth.inner.write().await = Some(creds.clone());
        Ok(())
    }

    pub async fn clear(oauth: &OAuthCredentials) -> std::io::Result<()> {
        let _ = std::fs::remove_file(&oauth.path);
        *oauth.inner.write().await = None;
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::io;

    use security_framework::passwords::{
        delete_generic_password, get_generic_password, set_generic_password,
    };

    use super::*;

    const SERVICE_NAME: &str = concat!(env!("CARGO_PKG_NAME"), ":oauth");
    const ACCOUNT_NAME: &str = "default";
    const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;

    pub async fn load(oauth: &OAuthCredentials) -> io::Result<()> {
        match get_generic_password(SERVICE_NAME, ACCOUNT_NAME) {
            Ok(bytes) => {
                match serde_json::from_slice::<Credentials>(&bytes) {
                    Ok(creds) => {
                        *oauth.inner.write().await = Some(creds);
                    }
                    Err(e) => {
                        tracing::warn!(
                            ?e,
                            "failed to parse keychain credentials; clearing in-memory"
                        );
                        *oauth.inner.write().await = None;
                    }
                }
                Ok(())
            }
            Err(e) if e.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(()),
            Err(e) => Err(io::Error::other(e)),
        }
    }

    pub async fn save(oauth: &OAuthCredentials, creds: &Credentials) -> io::Result<()> {
        let bytes = serde_json::to_vec_pretty(creds).map_err(io::Error::other)?;

        set_generic_password(SERVICE_NAME, ACCOUNT_NAME, &bytes).map_err(io::Error::other)?;

        *oauth.inner.write().await = Some(creds.clone());
        Ok(())
    }

    pub async fn clear(oauth: &OAuthCredentials) -> io::Result<()> {
        match delete_generic_password(SERVICE_NAME, ACCOUNT_NAME) {
            Ok(()) => {}
            Err(e) if e.code() == ERR_SEC_ITEM_NOT_FOUND => {}
            Err(e) => return Err(io::Error::other(e)),
        }

        *oauth.inner.write().await = None;
        Ok(())
    }
}
