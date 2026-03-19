//! Desktop editor integration.
//!
//! Sets up SSH config and builds editor URLs for remote-in-IDE workflows.
//! Transport concerns (relay tunneling) live in the server crate.

use relay_control::signing::RelaySigningService;
use serde::Serialize;
use ts_rs::TS;

use crate::{DesktopBridgeError, ssh_config};

#[derive(Debug, Clone, Serialize, TS)]
pub struct OpenRemoteEditorResponse {
    pub url: String,
    pub local_port: u16,
    pub ssh_alias: String,
}

/// Set up SSH config and build an editor URL for a tunneled remote session.
///
/// `local_port` is the local end of an already-established relay tunnel.
pub fn open_remote_editor(
    local_port: u16,
    signing: &RelaySigningService,
    host_id: &str,
    workspace_path: &str,
    editor_type: Option<&str>,
) -> Result<OpenRemoteEditorResponse, DesktopBridgeError> {
    let (key_path, alias) = ssh_config::provision_ssh_key(signing, host_id)?;
    ssh_config::update_ssh_config(&alias, local_port, &key_path)?;
    ssh_config::ensure_ssh_include()?;

    let url = build_editor_url(&alias, workspace_path, editor_type);

    Ok(OpenRemoteEditorResponse {
        url,
        local_port,
        ssh_alias: alias,
    })
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
