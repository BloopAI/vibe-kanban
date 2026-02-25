fn main() {
    tauri_build::build();

    #[cfg(target_os = "windows")]
    neutralize_duplicate_version_resources();
}

/// Both `tauri-winres` (via `embed_resource`) and the `winres` crate (used by
/// `codex-windows-sandbox`) embed a `1 VERSIONINFO` resource.
///
/// `tauri-winres` uses `cargo:rustc-link-arg-bins=` to pass `resource.lib`
/// directly as a linker argument.
///
/// `winres` uses `cargo:rustc-link-lib=dylib=resource` +
/// `cargo:rustc-link-search`, which propagates transitively through the rlib
/// dependency chain to the final binary link step.
///
/// When both `resource.lib` files reach the linker, CVTRES fails with
/// CVT1100 "duplicate resource type:VERSION" **before** the linker can apply
/// `/FORCE:MULTIPLE`.
///
/// Fix: overwrite `codex-windows-sandbox`'s `resource.lib` with a minimal
/// valid empty COFF archive so the linker finds it (satisfying the
/// `-lresource` from `cargo:rustc-link-lib`) but it contributes no resources.
#[cfg(target_os = "windows")]
fn neutralize_duplicate_version_resources() {
    let out_dir = match std::env::var("OUT_DIR") {
        Ok(d) => std::path::PathBuf::from(d),
        Err(_) => return,
    };

    // Navigate from OUT_DIR to the build/ directory.
    // OUT_DIR = .../build/<crate>-<hash>/out  →  build/ is 2 levels up.
    let build_dir = match out_dir.parent().and_then(|p| p.parent()) {
        Some(d) => d.to_path_buf(),
        None => return,
    };

    if let Ok(entries) = std::fs::read_dir(&build_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name.to_string_lossy().starts_with("codex-windows-sandbox-") {
                let resource_lib = entry.path().join("out").join("resource.lib");
                if resource_lib.exists() {
                    println!(
                        "cargo:warning=Neutralizing duplicate VERSION resource: {}",
                        resource_lib.display()
                    );
                    // Minimal valid empty COFF archive — the linker accepts it
                    // but it contributes no symbols or resources.
                    let _ = std::fs::write(&resource_lib, b"!<arch>\n");
                }
            }
        }
    }
}
