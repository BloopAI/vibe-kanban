use std::{env, fs, io::Write, path::PathBuf};

pub fn write_port_file(port: u16) -> std::io::Result<PathBuf> {
    let dir = env::var_os("PORT_FILE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::temp_dir().join("vibekanban"));
    let final_path = dir.join("vibekanban.port");
    let tmp_path = dir.join("vibekanban.port.tmp");

    tracing::debug!("Writing port {} to directory: {:?}", port, dir);

    // Ensure dir exists & locked-down
    fs::create_dir_all(&dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))?;
    }

    // Atomic write
    {
        let mut f = fs::File::create(&tmp_path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            f.set_permissions(fs::Permissions::from_mode(0o600))?;
        }
        write!(f, "{}", port)?;
        f.sync_all()?;
    }
    fs::rename(&tmp_path, &final_path)?;
    Ok(final_path)
}

pub fn read_port_file() -> std::io::Result<u16> {
    let dir = env::var_os("PORT_FILE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::temp_dir().join("vibekanban"));
    let file_path = dir.join("vibekanban.port");

    let content = fs::read_to_string(file_path)?;
    content
        .trim()
        .parse::<u16>()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}
