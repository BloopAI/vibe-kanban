use tokio::{process::Command, task};
use utils::shell::resolve_executable_path_blocking;

use super::gh_cli::{GhCli, GhCliError};

/// Ensures GitHub CLI is installed on the system.
/// Currently only supports macOS via homebrew.
///
/// # Returns
/// - `Ok(())` if GitHub CLI is already installed or was successfully installed
/// - `Err(String)` with error message if installation failed
pub async fn ensure_gh_cli_installed() -> Result<(), String> {
    // Check if gh is already available
    if resolve_executable_path_blocking("gh").is_some() {
        return Ok(());
    }

    // Only support macOS for now
    #[cfg(target_os = "macos")]
    {
        install_gh_cli_macos().await
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("GitHub CLI installation is currently only supported on macOS. Please install manually: https://cli.github.com/manual/installation".to_string())
    }
}

#[cfg(target_os = "macos")]
async fn install_gh_cli_macos() -> Result<(), String> {
    // Check if homebrew is available
    if resolve_executable_path_blocking("brew").is_none() {
        return Err(
            "Homebrew is not installed. Please install homebrew first (https://brew.sh) or install GitHub CLI manually: https://cli.github.com/manual/installation".to_string()
        );
    }

    // Install gh via homebrew
    let output = Command::new("brew")
        .args(["install", "gh"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute brew command: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Failed to install GitHub CLI via homebrew: {stderr}"
        ));
    }

    // Verify installation succeeded
    if resolve_executable_path_blocking("gh").is_none() {
        return Err(
            "GitHub CLI installation appeared to succeed but 'gh' command is still not available. Try restarting your terminal.".to_string()
        );
    }

    Ok(())
}

/// Checks if GitHub CLI is authenticated.
/// If not authenticated, returns an error with instructions for the user.
///
/// # Returns
/// - `Ok(())` if GitHub CLI is authenticated
/// - `Err(String)` with instructions if not authenticated
pub async fn ensure_gh_cli_authenticated() -> Result<(), String> {
    // Use GhCli to check authentication status
    let cli = GhCli::new();
    let result = task::spawn_blocking(move || cli.check_auth())
        .await
        .map_err(|e| format!("Failed to spawn blocking task: {e}"))?;

    match result {
        Ok(()) => Ok(()),
        Err(GhCliError::NotAvailable) => {
            Err("GitHub CLI is not installed. Please install it first.".to_string())
        }
        Err(GhCliError::AuthFailed(_)) => Err(
            "GitHub CLI is not authenticated. Please authenticate by running:\n\n\
            gh auth login --web --git-protocol https --skip-ssh-key\n\n\
            This will:\n\
            1. Show you a one-time code (e.g., ABCD-1234)\n\
            2. Open your browser to github.com/login/device\n\
            3. Let you complete OAuth authentication in the browser\n\
            4. Store your credentials securely for future use"
                .to_string(),
        ),
        Err(e) => Err(format!("Error checking GitHub CLI authentication: {e}")),
    }
}
