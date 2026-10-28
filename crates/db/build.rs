fn main() {
    // sqlx::migrate! must also rerun when a migration file is added.
    println!("cargo:rerun-if-changed=migrations");
}
