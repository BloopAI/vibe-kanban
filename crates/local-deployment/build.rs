use std::path::Path;

fn main() {
    // Load .env from the workspace root
    let workspace_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let env_file = workspace_root.join(".env");
    dotenv::from_path(&env_file).ok();

    // Recompile when VK_SHARED_API_BASE changes, since it's read via option_env!()
    println!("cargo:rerun-if-env-changed=VK_SHARED_API_BASE");
    if env_file.exists() {
        println!("cargo:rerun-if-changed={}", env_file.display());
    }

    // Pass VK_SHARED_API_BASE to the compiler so option_env!() sees it
    if let Ok(val) = std::env::var("VK_SHARED_API_BASE") {
        println!("cargo:rustc-env=VK_SHARED_API_BASE={}", val);
    }
}
