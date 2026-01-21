use std::fs;
use std::io::Write;
use std::path::PathBuf;

/// Error type for desktop operations
#[derive(Debug, thiserror::Error)]
pub enum DesktopError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Home directory not found")]
    HomeNotFound,

    #[error("Failed to get executable path")]
    ExePathNotFound,
}

pub type Result<T> = std::result::Result<T, DesktopError>;

/// Get the path to the user's desktop directory
pub fn get_desktop_path() -> Result<PathBuf> {
    let desktop = if cfg!(target_os = "macos") {
        // macOS: ~/Desktop
        dirs::home_dir()
            .ok_or(DesktopError::HomeNotFound)?
            .join("Desktop")
    } else if cfg!(target_os = "windows") {
        // Windows: Use FOLDERID_Desktop
        dirs::desktop_dir().ok_or(DesktopError::HomeNotFound)?
    } else {
        // Linux: ~/Desktop (XDG standard)
        dirs::desktop_dir().ok_or(DesktopError::HomeNotFound)?
    };

    Ok(desktop)
}

/// Create a desktop shortcut on macOS (.app bundle)
#[cfg(target_os = "macos")]
pub fn create_desktop_shortcut() -> Result<PathBuf> {
    use std::process::Command;

    // Get current executable path
    let exe_path = std::env::current_exe()
        .map_err(|_| DesktopError::ExePathNotFound)?;

    // Get the parent directory (should be the .app bundle's MacOS folder)
    let macos_dir = exe_path.parent()
        .ok_or(DesktopError::ExePathNotFound)?;

    // The .app bundle is two levels up from MacOS/executable
    let app_bundle = macos_dir.parent()
        .and_then(|p| p.parent())
        .ok_or(DesktopError::ExePathNotFound)?;

    // Verify it's actually an .app bundle
    if !app_bundle.extension().map_or(false, |ext| ext.eq_ignore_ascii_case("app")) {
        // If we're not in an .app bundle, we need to create one
        return create_macos_app_bundle(&exe_path);
    }

    // Get the app name from the bundle
    let app_name = app_bundle
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("VibeKanban");

    let desktop = get_desktop_path()?;
    let shortcut_path = desktop.join(app_name);

    // Copy the .app bundle to desktop
    if shortcut_path.exists() {
        fs::remove_dir_all(&shortcut_path)?;
    }

    // Create a symlink or copy the app
    #[allow(clippy::disallowed_methods)]
    let output = Command::new("cp")
        .arg("-R") // Recursive copy
        .arg(app_bundle)
        .arg(&shortcut_path)
        .output()?;

    if !output.status.success() {
        return Err(DesktopError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Failed to copy .app bundle",
        )));
    }

    tracing::info!("Created desktop shortcut at: {:?}", shortcut_path);
    Ok(shortcut_path)
}

/// Create a macOS .app bundle from an executable
#[cfg(target_os = "macos")]
fn create_macos_app_bundle(exe_path: &std::path::Path) -> Result<PathBuf> {
    let desktop = get_desktop_path()?;
    let app_name = "VibeKanban.app";
    let app_path = desktop.join(app_name);

    // Create .app bundle structure
    let contents_dir = app_path.join("Contents");
    let macos_dir = contents_dir.join("MacOS");
    let resources_dir = contents_dir.join("Resources");

    fs::create_dir_all(&macos_dir)?;
    fs::create_dir_all(&resources_dir)?;

    // Copy executable
    let exe_name = exe_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("vibe-kanban");
    let target_exe = macos_dir.join(exe_name);
    fs::copy(exe_path, &target_exe)?;

    // Make executable
    #[allow(clippy::disallowed_methods)]
    Command::new("chmod")
        .arg("+x")
        .arg(&target_exe)
        .status()?;

    // Create Info.plist
    let plist_content = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>VIBE_KANBAN_EXECUTABLE</string>
    <key>CFBundleIdentifier</key>
    <string>ai.bloop.vibe-kanban</string>
    <key>CFBundleName</key>
    <string>Vibe Kanban</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>"#;
    let plist_content = plist_content.replace("VIBE_KANBAN_EXECUTABLE", exe_name);
    let mut plist_file = fs::File::create(contents_dir.join("Info.plist"))?;
    plist_file.write_all(plist_content.as_bytes())?;

    tracing::info!("Created .app bundle at: {:?}", app_path);
    Ok(app_path)
}

/// Create a desktop shortcut on Windows (.lnk)
#[cfg(target_os = "windows")]
pub fn create_desktop_shortcut() -> Result<PathBuf> {
    use std::os::windows::fs::MetadataExt;

    // Get current executable path
    let exe_path = std::env::current_exe()
        .map_err(|_| DesktopError::ExePathNotFound)?;

    let desktop = get_desktop_path()?;
    let shortcut_name = "Vibe Kanban.lnk";
    let shortcut_path = desktop.join(shortcut_name);

    // Use PowerShell to create the shortcut
    let ps_script = format!(
        "$WshShell = New-Object -ComObject WScript.Shell; \
         $Shortcut = $WshShell.CreateShortcut('{}'); \
         $Shortcut.TargetPath = '{}'; \
         $Shortcut.WorkingDirectory = '{}'; \
         $Shortcut.Description = 'Vibe Kanban'; \
         $Shortcut.Save()",
        shortcut_path.display(),
        exe_path.display(),
        exe_path.parent()
            .map(|p| p.display().to_string())
            .unwrap_or_else(String::new)
    );

    #[allow(clippy::disallowed_methods)]
    let output = std::process::Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(&ps_script)
        .output()?;

    if !output.status.success() {
        tracing::error!("PowerShell error: {}", String::from_utf8_lossy(&output.stderr));
        return Err(DesktopError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            "Failed to create shortcut via PowerShell",
        )));
    }

    tracing::info!("Created desktop shortcut at: {:?}", shortcut_path);
    Ok(shortcut_path)
}

/// Create a desktop shortcut on Linux (.desktop file)
#[cfg(target_os = "linux")]
pub fn create_desktop_shortcut() -> Result<PathBuf> {
    // Get current executable path
    let exe_path = std::env::current_exe()
        .map_err(|_| DesktopError::ExePathNotFound)?;

    let desktop = get_desktop_path()?;
    let shortcut_name = "vibe-kanban.desktop";
    let shortcut_path = desktop.join(shortcut_name);

    let icon_path = exe_path.parent()
        .map(|p| p.join("vibe-kanban.png"))
        .unwrap_or_else(|| PathBuf::from("vibe-kanban"));

    let desktop_entry = format!(
        "[Desktop Entry]\n\
         Version=1.0\n\
         Type=Application\n\
         Name=Vibe Kanban\n\
         Comment=AI-powered project management\n\
         Exec={}\n\
         Icon={}\n\
         Terminal=false\n\
         Categories=Development;IDE;\n",
        exe_path.display(),
        icon_path.display()
    );

    let mut file = fs::File::create(&shortcut_path)?;
    file.write_all(desktop_entry.as_bytes())?;

    // Make the .desktop file executable
    #[allow(clippy::disallowed_methods)]
    Command::new("chmod")
        .arg("+x")
        .arg(&shortcut_path)
        .status()?;

    tracing::info!("Created desktop shortcut at: {:?}", shortcut_path);
    Ok(shortcut_path)
}

/// Check if desktop shortcut already exists
pub fn desktop_shortcut_exists() -> bool {
    let desktop = match get_desktop_path() {
        Ok(path) => path,
        Err(_) => return false,
    };

    let shortcut_name = if cfg!(target_os = "macos") {
        "VibeKanban.app"
    } else if cfg!(target_os = "windows") {
        "Vibe Kanban.lnk"
    } else {
        "vibe-kanban.desktop"
    };

    desktop.join(shortcut_name).exists()
}
