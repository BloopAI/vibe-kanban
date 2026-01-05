use crate::is_wsl2;
use crate::shell::UnixShell;
use std::path::Path;

/// Open terminal at the given path with cross-platform support
pub async fn open_terminal(
    path: &Path,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let path_str = path.to_string_lossy();

    if is_wsl2() {
        // In WSL2, use PowerShell to open Windows Terminal
        tokio::process::Command::new("powershell.exe")
            .arg("-Command")
            .arg(format!("Start-Process wt.exe -ArgumentList '-d \"{path_str}\"'"))
            .spawn()?;
        Ok(())
    } else {
        #[cfg(target_os = "macos")]
        {
            // macOS: Use Terminal.app or iTerm2 if available
            tokio::process::Command::new("open")
                .arg("-a")
                .arg("Terminal")
                .arg(path)
                .spawn()?;
            Ok(())
        }

        #[cfg(target_os = "linux")]
        {
            // Linux: Try common terminal emulators in order of preference
            let terminals = [
                "gnome-terminal",
                "konsole",
                "xfce4-terminal",
                "xterm",
                "alacritty",
                "kitty",
                "wezterm",
            ];

            for terminal in &terminals {
                let result = match *terminal {
                    "gnome-terminal" => {
                        tokio::process::Command::new(terminal)
                            .arg("--working-directory")
                            .arg(path)
                            .spawn()
                    }
                    "konsole" => {
                        tokio::process::Command::new(terminal)
                            .arg("--workdir")
                            .arg(path)
                            .spawn()
                    }
                    "xfce4-terminal" => {
                        tokio::process::Command::new(terminal)
                            .arg("--working-directory")
                            .arg(path)
                            .spawn()
                    }
                    "xterm" | "alacritty" | "kitty" | "wezterm" => {
                        // estos terminales no tienen un flag directo para working directory
                        // usamos un comando shell para cd al directorio, respetando el shell del usuario
                        let user_shell = UnixShell::current_shell();
                        let shell_path = user_shell.path();
                        let shell_path_str = shell_path.to_string_lossy();
                        // fish usa sintaxis diferente a POSIX shells
                        let cd_command = if user_shell == UnixShell::Fish {
                            format!("cd '{}'; exec {}", path_str, shell_path_str)
                        } else {
                            format!("cd '{}' && exec {}", path_str, shell_path_str)
                        };
                        tokio::process::Command::new(terminal)
                            .arg("-e")
                            .arg(shell_path_str.as_ref())
                            .arg("-c")
                            .arg(cd_command)
                            .spawn()
                    }
                    _ => continue,
                };

                if result.is_ok() {
                    return Ok(());
                }
            }

            // If no terminal worked, return an error
            Err("No supported terminal emulator found".into())
        }

        #[cfg(target_os = "windows")]
        {
            // Windows: Use Windows Terminal (wt.exe) or fallback to cmd.exe
            let result = tokio::process::Command::new("wt.exe")
                .arg("-d")
                .arg(path)
                .spawn();

            if result.is_ok() {
                Ok(())
            } else {
                // Fallback to cmd.exe
                tokio::process::Command::new("cmd.exe")
                    .arg("/C")
                    .arg("start")
                    .arg("cmd.exe")
                    .arg("/K")
                    .arg(format!("cd /d \"{}\"", path_str))
                    .spawn()?;
                Ok(())
            }
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            Err("Unsupported operating system".into())
        }
    }
}
