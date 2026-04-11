use std::{env, path::PathBuf};

use serde::{Deserialize, Serialize};
use tokio::fs;

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct PortInfo {
    pub main_port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_proxy_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backend_url: Option<String>,
}

pub async fn write_port_file_with_proxy(
    main_port: u16,
    preview_proxy_port: Option<u16>,
) -> std::io::Result<PathBuf> {
    write_port_file_with_proxy_and_backend_url(main_port, preview_proxy_port, None).await
}

pub async fn write_port_file_with_proxy_and_backend_url(
    main_port: u16,
    preview_proxy_port: Option<u16>,
    backend_url: Option<String>,
) -> std::io::Result<PathBuf> {
    let dir = env::temp_dir().join("vibe-kanban");
    let path = dir.join("vibe-kanban.port");
    let port_info = PortInfo {
        main_port,
        preview_proxy_port,
        backend_url,
    };
    let content = serde_json::to_string(&port_info)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    tracing::debug!("Writing ports {:?} to {:?}", port_info, path);
    fs::create_dir_all(&dir).await?;
    fs::write(&path, content).await?;
    Ok(path)
}

pub async fn read_port_file(app_name: &str) -> std::io::Result<u16> {
    read_port_info(app_name).await.map(|info| info.main_port)
}

pub async fn read_port_info(app_name: &str) -> std::io::Result<PortInfo> {
    let dir = env::temp_dir().join(app_name);
    let path = dir.join(format!("{app_name}.port"));
    tracing::debug!("Reading port from {:?}", path);

    let content = fs::read_to_string(&path).await?;
    parse_port_info(&content)
}

fn parse_port_info(content: &str) -> std::io::Result<PortInfo> {
    if let Ok(port_info) = serde_json::from_str::<PortInfo>(content) {
        return Ok(port_info);
    }

    let port: u16 = content
        .trim()
        .parse()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

    Ok(PortInfo {
        main_port: port,
        preview_proxy_port: None,
        backend_url: None,
    })
}

#[cfg(test)]
mod tests {
    use super::{PortInfo, parse_port_info};

    #[test]
    fn parses_legacy_raw_port_format() {
        let info = parse_port_info("4567").expect("raw port should parse");

        assert_eq!(
            info,
            PortInfo {
                main_port: 4567,
                preview_proxy_port: None,
                backend_url: None,
            }
        );
    }

    #[test]
    fn parses_legacy_json_without_backend_url() {
        let info = parse_port_info(r#"{"main_port":4567,"preview_proxy_port":8901}"#)
            .expect("legacy json should parse");

        assert_eq!(
            info,
            PortInfo {
                main_port: 4567,
                preview_proxy_port: Some(8901),
                backend_url: None,
            }
        );
    }

    #[test]
    fn serializes_and_parses_backend_url_field() {
        let port_info = PortInfo {
            main_port: 4567,
            preview_proxy_port: Some(8901),
            backend_url: Some("http://localhost:4567".to_string()),
        };

        let serialized = serde_json::to_string(&port_info).expect("port info should serialize");
        let reparsed = parse_port_info(&serialized).expect("serialized json should parse");

        assert_eq!(reparsed, port_info);
        assert!(serialized.contains(r#""backend_url":"http://localhost:4567""#));
    }
}
