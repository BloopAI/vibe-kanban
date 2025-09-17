use std::{env, path::PathBuf};

use tokio::fs;

pub async fn write_port_file(port: u16) -> std::io::Result<PathBuf> {
    let dir = env::temp_dir().join("vibe-kanban");
    let path = dir.join("vibe-kanban.port");
    tracing::debug!("Writing port {} to {:?}", port, path);
    fs::create_dir_all(&dir).await?;
    fs::write(&path, port.to_string()).await?;
    Ok(path)
}

pub async fn read_port_file(app_name: &str) -> std::io::Result<u16> {
    let base = if cfg!(target_os = "linux") {
        match env::var("XDG_RUNTIME_DIR") {
            Ok(val) if !val.is_empty() => PathBuf::from(val),
            _ => env::temp_dir(),
        }
    } else {
        env::temp_dir()
    };

    let path = base.join(app_name).join(format!("{}.port", app_name));
    tracing::debug!("Reading port from {:?}", path);

    let content = fs::read_to_string(&path).await?;
    let port: u16 = content
        .trim()
        .parse()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

    Ok(port)
}
