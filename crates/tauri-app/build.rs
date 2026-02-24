fn main() {
    tauri_build::build();

    // On Windows, codex-windows-sandbox's build.rs uses winres to embed a
    // VERSION resource into its output. tauri-build also embeds a VERSION
    // resource via tauri-winres. When the final binary is linked, the linker
    // invokes CVTRES which fails with CVT1100 "duplicate resource" because
    // both resource files define `1 VERSIONINFO`.
    //
    // Fix: find and remove the codex-windows-sandbox resource files from the
    // build directory so the linker only sees tauri-winres's VERSION resource.
    #[cfg(target_os = "windows")]
    remove_conflicting_resource_libs();
}

#[cfg(target_os = "windows")]
fn remove_conflicting_resource_libs() {
    // The target build directory is at OUT_DIR/../../..
    // OUT_DIR is something like target/<triple>/release/build/<crate>-<hash>/out
    let out_dir = match std::env::var("OUT_DIR") {
        Ok(d) => std::path::PathBuf::from(d),
        Err(_) => return,
    };

    // Navigate from OUT_DIR to the build/ directory
    // OUT_DIR = .../build/vibe-kanban-tauri-HASH/out
    // build/  = .../build/
    let build_dir = match out_dir
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
    {
        Some(d) => d.to_path_buf(),
        None => return,
    };

    // Find codex-windows-sandbox-*/out/ directories and remove resource files
    if let Ok(entries) = std::fs::read_dir(&build_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with("codex-windows-sandbox-") {
                let out_path = entry.path().join("out");
                for resource_file in &["resource.lib", "resource.o", "resource.res"] {
                    let resource_path = out_path.join(resource_file);
                    if resource_path.exists() {
                        let _ = std::fs::remove_file(&resource_path);
                    }
                }
            }
        }
    }
}
