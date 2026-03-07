//! SSH key provisioning and config management for remote IDE opening.
//!
//! Converts the browser's Ed25519 signing key (JWK) into an OpenSSH private key
//! file and writes SSH config entries so VS Code Remote SSH can connect through
//! the relay tunnel.

use std::{fs, path::PathBuf};

use anyhow::Context as _;
use ed25519_dalek::SigningKey;
use sha2::{Digest, Sha256};
use ssh_key::private::{Ed25519Keypair, Ed25519PrivateKey, KeypairData};

/// Provision an SSH identity for the given signing key.
///
/// Writes the OpenSSH PEM private key to `~/.vk-ssh/keys/{hash}` and returns
/// the path and the host alias (`vk-{hash}`).
pub fn provision_ssh_key(signing_key: &SigningKey) -> anyhow::Result<(PathBuf, String)> {
    let key_hash = short_key_hash(signing_key);
    let alias = format!("vk-{key_hash}");

    let ssh_dir = vk_ssh_dir()?;
    let keys_dir = ssh_dir.join("keys");
    fs::create_dir_all(&keys_dir).context("Failed to create ~/.vk-ssh/keys")?;

    let key_path = keys_dir.join(&key_hash);

    // Write the OpenSSH PEM private key
    let pem = signing_key_to_openssh_pem(signing_key)?;
    fs::write(&key_path, pem.as_bytes()).context("Failed to write SSH key")?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&key_path, fs::Permissions::from_mode(0o600))
            .context("Failed to set SSH key permissions")?;
    }

    Ok((key_path, alias))
}

/// Write (or update) an SSH config entry for the given host alias.
///
/// The config is written to `~/.vk-ssh/config` and points at the local tunnel port.
pub fn update_ssh_config(alias: &str, port: u16, key_path: &std::path::Path) -> anyhow::Result<()> {
    let ssh_dir = vk_ssh_dir()?;
    let config_path = ssh_dir.join("config");

    let entry = format!(
        "\nHost {alias}\n    HostName 127.0.0.1\n    Port {port}\n    User vk\n    IdentityFile {key}\n    StrictHostKeyChecking no\n    UserKnownHostsFile /dev/null\n",
        key = key_path.display(),
    );

    // Read existing config and replace or append the entry for this alias
    let existing = fs::read_to_string(&config_path).unwrap_or_default();
    let new_config = replace_host_block(&existing, alias, &entry);
    fs::write(&config_path, new_config).context("Failed to write ~/.vk-ssh/config")?;

    Ok(())
}

/// Ensure `~/.ssh/config` includes our `~/.vk-ssh/config`.
pub fn ensure_ssh_include() -> anyhow::Result<()> {
    let ssh_dir = dirs::home_dir().context("No home directory")?.join(".ssh");
    fs::create_dir_all(&ssh_dir).context("Failed to create ~/.ssh")?;

    let config_path = ssh_dir.join("config");
    let include_line = "Include ~/.vk-ssh/config";

    let existing = fs::read_to_string(&config_path).unwrap_or_default();
    if existing.contains(include_line) {
        return Ok(());
    }

    // Prepend the Include directive (SSH config is first-match)
    let new_content = format!("{include_line}\n{existing}");
    fs::write(&config_path, new_content).context("Failed to update ~/.ssh/config")?;

    Ok(())
}

fn vk_ssh_dir() -> anyhow::Result<PathBuf> {
    let home = dirs::home_dir().context("No home directory")?;
    Ok(home.join(".vk-ssh"))
}

fn short_key_hash(key: &SigningKey) -> String {
    let hash = Sha256::digest(key.verifying_key().as_bytes());
    hash[..8].iter().map(|b| format!("{b:02x}")).collect()
}

fn signing_key_to_openssh_pem(key: &SigningKey) -> anyhow::Result<String> {
    let ed25519_private = Ed25519PrivateKey::from_bytes(&key.to_bytes());
    let keypair = Ed25519Keypair::from(ed25519_private);
    let keypair_data = KeypairData::Ed25519(keypair);
    let private_key =
        ssh_key::PrivateKey::new(keypair_data, "").context("Failed to create SSH private key")?;
    let pem = private_key
        .to_openssh(ssh_key::LineEnding::LF)
        .context("Failed to encode SSH key as OpenSSH PEM")?;
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
