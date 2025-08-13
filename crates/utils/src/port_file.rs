use std::{env, fs::Permissions, path::PathBuf};

use tokio::{fs, io::AsyncWriteExt};

pub async fn write_port_file(port: u16) -> std::io::Result<PathBuf> {
    let dir = env::var_os("PORT_FILE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::temp_dir().join("vibekanban"));
    let final_path = dir.join("vibekanban.port");
    let tmp_path = dir.join("vibekanban.port.tmp");

    tracing::debug!("Writing port {} to directory: {:?}", port, dir);

    // Ensure dir exists & locked-down
    fs::create_dir_all(&dir).await?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dir, Permissions::from_mode(0o700)).await?;
    }

    // Atomic write
    {
        let mut f = fs::File::create(&tmp_path).await?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let std_file = f.into_std().await;
            std_file.set_permissions(Permissions::from_mode(0o600))?;
            f = fs::File::from_std(std_file);
        }
        f.write_all(port.to_string().as_bytes()).await?;
        f.sync_all().await?;
    }
    fs::rename(&tmp_path, &final_path).await?;
    Ok(final_path)
}
