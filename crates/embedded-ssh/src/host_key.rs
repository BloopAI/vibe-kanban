use std::{fs, io, path::Path};

use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;
use russh_keys::PrivateKey;
use ssh_key::private::{Ed25519Keypair, Ed25519PrivateKey, KeypairData};

/// Load the SSH host key from disk, or generate a new one.
///
/// The key is stored as raw 32-byte Ed25519 seed at the given path.
/// Follows the same atomic-write pattern as `RelaySigningService::load_or_generate`.
pub fn load_or_generate(key_path: &Path) -> io::Result<PrivateKey> {
    let signing_key = if let Ok(bytes) = fs::read(key_path) {
        let arr: [u8; 32] = bytes.try_into().map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "SSH host key file has invalid length (expected 32 bytes)",
            )
        })?;
        SigningKey::from_bytes(&arr)
    } else {
        let key = SigningKey::generate(&mut OsRng);

        if let Some(parent) = key_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let tmp = key_path.with_extension("tmp");
        fs::write(&tmp, key.to_bytes())?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))?;
        }

        fs::rename(&tmp, key_path)?;
        key
    };

    Ok(ed25519_to_private_key(&signing_key))
}

fn ed25519_to_private_key(key: &SigningKey) -> PrivateKey {
    let ed25519_private = Ed25519PrivateKey::from_bytes(&key.to_bytes());
    let keypair = Ed25519Keypair::from(ed25519_private);
    let keypair_data = KeypairData::Ed25519(keypair);
    PrivateKey::new(keypair_data, "").expect("valid Ed25519 key")
}
