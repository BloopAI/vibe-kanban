fn main() {
    // Recompile when VK_SHARED_API_BASE changes, since it's read via option_env!()
    println!("cargo:rerun-if-env-changed=VK_SHARED_API_BASE");
}
