//! Reusable desktop bridge service logic.
//!
//! This module contains the core "open remote editor" workflow without HTTP
//! server concerns so it can be embedded into other binaries (for example the
//! main local server process).

use serde::Serialize;
use thiserror::Error;
use ts_rs::TS;

use crate::{signing::SigningContext, ssh_config, tunnel::TunnelManager};

#[derive(Debug, Clone)]
pub struct OpenRemoteEditorOptions {
    pub workspace_path: String,
    pub editor_type: Option<String>,
    /// Relay proxy session URL (e.g. https://relay.example.com/relay/h/{host_id}/s/{session_id})
    pub relay_session_base_url: String,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct OpenRemoteEditorResponse {
    pub url: String,
    pub local_port: u16,
    pub ssh_alias: String,
}

#[derive(Debug, Error)]
pub enum OpenRemoteEditorError {
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

#[derive(Default)]
pub struct DesktopBridgeService {
    tunnel_manager: TunnelManager,
}

impl DesktopBridgeService {
    pub fn new(tunnel_manager: TunnelManager) -> Self {
        Self { tunnel_manager }
    }

    pub async fn open_remote_editor(
        &self,
        options: OpenRemoteEditorOptions,
        signing_ctx: SigningContext,
    ) -> Result<OpenRemoteEditorResponse, OpenRemoteEditorError> {
        let local_port = self
            .tunnel_manager
            .get_or_create_ssh_tunnel(&options.relay_session_base_url, &signing_ctx)
            .await?;

        let (key_path, alias) = ssh_config::provision_ssh_key(&signing_ctx.signing_key)?;
        ssh_config::update_ssh_config(&alias, local_port, &key_path)?;
        ssh_config::ensure_ssh_include()?;

        let url = build_editor_url(
            &alias,
            &options.workspace_path,
            options.editor_type.as_deref(),
        );

        Ok(OpenRemoteEditorResponse {
            url,
            local_port,
            ssh_alias: alias,
        })
    }
}

fn build_editor_url(alias: &str, workspace_path: &str, editor_type: Option<&str>) -> String {
    let editor = editor_type.unwrap_or("VS_CODE");
    match editor.to_uppercase().as_str() {
        "ZED" => format!("zed://ssh/{alias}{workspace_path}"),
        scheme_name => {
            let scheme = match scheme_name {
                "VS_CODE_INSIDERS" => "vscode-insiders",
                "CURSOR" => "cursor",
                "WINDSURF" => "windsurf",
                "GOOGLE_ANTIGRAVITY" => "antigravity",
                _ => "vscode",
            };
            let base = format!("{scheme}://vscode-remote/ssh-remote+{alias}{workspace_path}");
            if matches!(scheme, "vscode" | "vscode-insiders") {
                format!("{base}?windowId=_blank")
            } else {
                base
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::build_editor_url;

    #[test]
    fn builds_vscode_url_by_default() {
        let url = build_editor_url("vk-abc", "/tmp/ws", None);
        assert_eq!(
            url,
            "vscode://vscode-remote/ssh-remote+vk-abc/tmp/ws?windowId=_blank"
        );
    }

    #[test]
    fn builds_known_editor_schemes() {
        let zed = build_editor_url("vk-abc", "/tmp/ws", Some("zed"));
        assert_eq!(zed, "zed://ssh/vk-abc/tmp/ws");

        let cursor = build_editor_url("vk-abc", "/tmp/ws", Some("cursor"));
        assert_eq!(cursor, "cursor://vscode-remote/ssh-remote+vk-abc/tmp/ws");
    }
}
