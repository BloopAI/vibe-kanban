//! SSH key provisioning and config management for remote IDE opening.
//!
//! Converts the browser's Ed25519 signing key (JWK) into an OpenSSH private key
//! file and writes SSH config entries so VS Code Remote SSH can connect through
//! the relay tunnel.

use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use relay_control::signing::RelaySigningService;
use sha2::{Digest, Sha256};
use ssh_key::private::{Ed25519Keypair, Ed25519PrivateKey, KeypairData};

use crate::DesktopBridgeError;

/// Provision an SSH identity for the given signing service and remote host.
///
/// Writes the OpenSSH PEM private key to `~/.vk-ssh/keys/{hash}` and returns
/// the path and the host alias (`vk-{host_id}`).
pub(crate) fn provision_ssh_key(
    signing: &RelaySigningService,
    host_id: &str,
) -> Result<(PathBuf, String), DesktopBridgeError> {
    let key_hash = short_key_hash(signing);
    let alias = format!("vk-{host_id}");

    let ssh_dir = vk_ssh_dir()?;
    let keys_dir = ssh_dir.join("keys");
    fs::create_dir_all(&keys_dir)?;

    let key_path = keys_dir.join(&key_hash);

    // Write the OpenSSH PEM private key
    let pem = signing_key_to_openssh_pem(signing)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

        // Create with restrictive mode from the start to avoid exposing the key
        // under default umask-derived permissions during creation.
        let mut file = fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(&key_path)?;
        file.write_all(pem.as_bytes())?;
        file.flush()?;
        fs::set_permissions(&key_path, fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(not(unix))]
    {
        fs::write(&key_path, pem.as_bytes())?;
    }

    Ok((key_path, alias))
}

/// Write (or update) an SSH config entry for the given host alias.
///
/// The config is written to `~/.vk-ssh/config` and points at the local tunnel port.
pub(crate) fn update_ssh_config(
    alias: &str,
    port: u16,
    key_path: &std::path::Path,
) -> Result<(), DesktopBridgeError> {
    let ssh_dir = vk_ssh_dir()?;
    let config_path = ssh_dir.join("config");
    let null_known_hosts = if cfg!(windows) { "NUL" } else { "/dev/null" };

    let entry = format!(
        "\nHost {alias}\n    HostName 127.0.0.1\n    Port {port}\n    User vk\n    IdentityFile {key}\n    StrictHostKeyChecking no\n    UserKnownHostsFile {null_known_hosts}\n",
        key = key_path.display(),
    );

    // Read existing config and replace or append the entry for this alias
    let existing = fs::read_to_string(&config_path).unwrap_or_default();
    let new_config = replace_host_block(&existing, alias, &entry);
    atomic_write_text_file(&config_path, &new_config)?;

    Ok(())
}

/// Ensure `~/.ssh/config` includes our `~/.vk-ssh/config`.
pub(crate) fn ensure_ssh_include() -> Result<(), DesktopBridgeError> {
    let ssh_dir = dirs::home_dir()
        .ok_or(DesktopBridgeError::NoHomeDirectory)?
        .join(".ssh");
    fs::create_dir_all(&ssh_dir)?;

    let config_path = ssh_dir.join("config");
    let include_line = "Include ~/.vk-ssh/config";

    let existing = fs::read_to_string(&config_path).unwrap_or_default();
    if existing.contains(include_line) {
        return Ok(());
    }

    // Prepend the Include directive (SSH config is first-match)
    let new_content = format!("{include_line}\n{existing}");
    atomic_write_text_file(&config_path, &new_content)?;

    Ok(())
}

fn vk_ssh_dir() -> Result<PathBuf, DesktopBridgeError> {
    let home = dirs::home_dir().ok_or(DesktopBridgeError::NoHomeDirectory)?;
    Ok(home.join(".vk-ssh"))
}

fn atomic_write_text_file(path: &Path, content: &str) -> Result<(), DesktopBridgeError> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "cannot atomically write path without a parent directory",
        )
    })?;
    fs::create_dir_all(parent)?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("config");
    let tmp_name = format!(".{file_name}.tmp-{}-{nonce}", std::process::id());
    let tmp_path = parent.join(tmp_name);

    let mut tmp_file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&tmp_path)?;
    tmp_file.write_all(content.as_bytes())?;
    tmp_file.sync_all()?;
    drop(tmp_file);

    if let Ok(existing_meta) = fs::metadata(path) {
        let _ = fs::set_permissions(&tmp_path, existing_meta.permissions());
    }

    fs::rename(&tmp_path, path)?;

    #[cfg(unix)]
    {
        let parent_dir = fs::File::open(parent)?;
        parent_dir.sync_all()?;
    }

    Ok(())
}

fn short_key_hash(signing: &RelaySigningService) -> String {
    let hash = Sha256::digest(signing.server_public_key().as_bytes());
    hash[..8].iter().map(|b| format!("{b:02x}")).collect()
}

fn signing_key_to_openssh_pem(signing: &RelaySigningService) -> Result<String, DesktopBridgeError> {
    let ed25519_private = Ed25519PrivateKey::from_bytes(&signing.signing_key().to_bytes());
    let keypair = Ed25519Keypair::from(ed25519_private);
    let keypair_data = KeypairData::Ed25519(keypair);
    let private_key = ssh_key::PrivateKey::new(keypair_data, "")?;
    let pem = private_key.to_openssh(ssh_key::LineEnding::LF)?;
    Ok(pem.to_string())
}

/// Replace the `Host {alias}` block in an SSH config, or append if not found.
fn replace_host_block(config: &str, alias: &str, new_block: &str) -> String {
    let host_marker = format!("Host {alias}");
    let mut result = String::new();
    let mut skip = false;

    for line in config.lines() {
        if line.trim() == host_marker {
            skip = true;
            continue;
        }
        if skip {
            // Stop skipping when we hit the next Host block or end of indented section
            if line.starts_with("Host ")
                || (!line.starts_with(' ') && !line.starts_with('\t') && !line.trim().is_empty())
            {
                skip = false;
                result.push_str(line);
                result.push('\n');
            }
            continue;
        }
        result.push_str(line);
        result.push('\n');
    }

    result.push_str(new_block);
    result
}
