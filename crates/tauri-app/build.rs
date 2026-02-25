fn main() {
    tauri_build::build();

    #[cfg(target_os = "windows")]
    fix_duplicate_version_resources();
}

/// Prevent CVTRES CVT1100 "duplicate resource type:VERSION" on Windows.
///
/// `tauri-winres` creates `{OUT_DIR}/resource.lib` (actually a `.res` file)
/// and passes it to the linker via `cargo:rustc-link-arg-bins=`. Meanwhile,
/// `codex-windows-sandbox` (a transitive dep) uses the `winres` crate which
/// emits `cargo:rustc-link-lib=dylib=resource` + `cargo:rustc-link-search`.
/// This tells the linker to search all LIBPATHs for `resource.lib` — including
/// our own OUT_DIR. The linker loads the same VERSION resource twice and CVTRES
/// fails before `/FORCE:MULTIPLE` can take effect.
///
/// Fix:
/// 1. Copy `resource.lib` → `tauri_resource.lib` (preserving the real content)
/// 2. Overwrite `resource.lib` with a valid empty `.res` file
/// 3. Emit `cargo:rustc-link-arg-bins=tauri_resource.lib` for the real resource
/// 4. Also overwrite `codex-windows-sandbox`'s `resource.lib`
///
/// Result: the original link-arg and LIBPATH search both find empty `.res`
/// stubs, while our new link-arg provides the single copy of resources.
#[cfg(target_os = "windows")]
fn fix_duplicate_version_resources() {
    let out_dir = match std::env::var("OUT_DIR") {
        Ok(d) => std::path::PathBuf::from(d),
        Err(_) => return,
    };

    // Save the real resource under a unique name, then replace the original
    // with an empty stub so duplicates from LIBPATH search contribute nothing.
    let our_resource = out_dir.join("resource.lib");
    let renamed = out_dir.join("tauri_resource.lib");
    if our_resource.exists() {
        if std::fs::copy(&our_resource, &renamed).is_ok() {
            let _ = std::fs::write(&our_resource, empty_res_file());
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
                    let _ = std::fs::write(&resource_lib, empty_res_file());
                }
            }
        }
    }
}

/// A minimal valid `.res` file (COFF resource format) containing no resources.
///
/// The `.res` format starts with a 32-byte "empty" sentinel entry:
///   - DataSize: 0x00000000 (4 bytes LE)
///   - HeaderSize: 0x00000020 (4 bytes LE)
///   - TYPE: 0xFFFF 0x0000 (ordinal zero)
///   - NAME: 0xFFFF 0x0000 (ordinal zero)
///   - DataVersion, MemoryFlags, LanguageId, Version, Characteristics: all zero
///
/// This is the standard header that `rc.exe` and CVTRES expect at the start of
/// every `.res` file. A file containing only this header is treated as empty.
#[cfg(target_os = "windows")]
fn empty_res_file() -> Vec<u8> {
    let mut buf = Vec::with_capacity(32);
    buf.extend_from_slice(&0u32.to_le_bytes()); // DataSize = 0
    buf.extend_from_slice(&0x20u32.to_le_bytes()); // HeaderSize = 32
    buf.extend_from_slice(&0xFFFFu16.to_le_bytes()); // TYPE: ordinal indicator
    buf.extend_from_slice(&0x0000u16.to_le_bytes()); // TYPE: ordinal 0
    buf.extend_from_slice(&0xFFFFu16.to_le_bytes()); // NAME: ordinal indicator
    buf.extend_from_slice(&0x0000u16.to_le_bytes()); // NAME: ordinal 0
    buf.extend_from_slice(&0u32.to_le_bytes()); // DataVersion
    buf.extend_from_slice(&0u16.to_le_bytes()); // MemoryFlags
    buf.extend_from_slice(&0u16.to_le_bytes()); // LanguageId
    buf.extend_from_slice(&0u32.to_le_bytes()); // Version
    buf.extend_from_slice(&0u32.to_le_bytes()); // Characteristics
    buf
}
