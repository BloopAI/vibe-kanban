fn main() {
    tauri_build::build();

    // On Windows, codex-windows-sandbox's build.rs uses winres to embed a
    // VERSION resource into its .rlib via the `winres` crate. tauri-build also
    // embeds a VERSION resource via `tauri-winres`. When the final binary is
    // linked, the MSVC linker invokes CVTRES which fails with CVT1100
    // "duplicate resource" because both define `1 VERSIONINFO`.
    //
    // The resource from codex-windows-sandbox is baked into its .rlib at
    // compile time, so we cannot remove it. Instead, tell the linker to
    // tolerate duplicate resources and use whichever it encounters first.
    #[cfg(target_os = "windows")]
    println!("cargo:rustc-link-arg=/FORCE:MULTIPLE");
}
