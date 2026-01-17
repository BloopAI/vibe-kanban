use std::{env, fs, path::Path};

fn main() {
    let args: Vec<String> = env::args().collect();
    let check_mode = args.iter().any(|arg| arg == "--check");

    let json = remote::shapes::export_shapes_json();

    // Path to shared/shapes.json relative to workspace root
    let output_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent() // crates/
        .unwrap()
        .parent() // workspace root
        .unwrap()
        .join("shared/shapes.json");

    if check_mode {
        let current = fs::read_to_string(&output_path).unwrap_or_default();
        if current == json {
            println!("✅ shared/shapes.json is up to date.");
            std::process::exit(0);
        } else {
            eprintln!("❌ shared/shapes.json is not up to date.");
            eprintln!("Please run 'pnpm run export-shapes' and commit the changes.");
            std::process::exit(1);
        }
    } else {
        fs::write(&output_path, &json).expect("Failed to write shapes.json");
        println!("✅ Wrote shapes to {}", output_path.display());
    }
}
