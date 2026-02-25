fn main() {
    tauri_build::build();

    #[cfg(target_os = "windows")]
    fix_duplicate_version_resources();
}

/// Prevent CVTRES CVT1100 "duplicate resource type:VERSION" on Windows.
///
/// `tauri-winres` creates `{OUT_DIR}/resource.lib` and passes it to the linker
/// via `cargo:rustc-link-arg-bins=`. Meanwhile, `codex-windows-sandbox` (a
/// transitive dep) uses the `winres` crate which emits
/// `cargo:rustc-link-lib=dylib=resource` + `cargo:rustc-link-search`. This
/// tells the linker to search all LIBPATHs for `resource.lib` — including our
/// own OUT_DIR, which is also on the LIBPATH. The linker loads the same file
/// twice (once as a direct arg, once via search), and CVTRES fails on the
/// duplicate VERSION resource before `/FORCE:MULTIPLE` can take effect.
///
/// Fix:
/// 1. Copy `resource.lib` → `tauri_resource.lib` (preserving the real content)
/// 2. Overwrite `resource.lib` with an empty COFF archive
/// 3. Emit `cargo:rustc-link-arg-bins=tauri_resource.lib` for the real resource
/// 4. Also empty `codex-windows-sandbox`'s `resource.lib`
///
/// Result: the original link-arg and LIBPATH search both find empty archives,
/// while our new link-arg provides the single copy of VERSION resources.
#[cfg(target_os = "windows")]
fn fix_duplicate_version_resources() {
    let out_dir = match std::env::var("OUT_DIR") {
        Ok(d) => std::path::PathBuf::from(d),
        Err(_) => return,
    };

    // Rename our resource.lib so the LIBPATH search for "resource" finds only
    // the empty stub, while we pass the real content via a new link-arg.
    let our_resource = out_dir.join("resource.lib");
    let renamed = out_dir.join("tauri_resource.lib");
    if our_resource.exists() {
        if std::fs::copy(&our_resource, &renamed).is_ok() {
            // Replace original with empty COFF archive
            let _ = std::fs::write(&our_resource, b"!<arch>\n");
            // Pass the real resource under the new name
            println!("cargo:rustc-link-arg-bins={}", renamed.display());
        }
    }

    // Neutralize codex-windows-sandbox's resource.lib too
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
                    let _ = std::fs::write(&resource_lib, b"!<arch>\n");
                }
            }
        }
    }
}
