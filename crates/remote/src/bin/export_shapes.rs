use std::fs;
use std::path::Path;

fn main() {
    let json = remote::shapes::export_shapes_json();

    // Write to shared/shapes.json relative to workspace root
    let output_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent() // crates/
        .unwrap()
        .parent() // workspace root
        .unwrap()
        .join("shared/shapes.json");

    fs::write(&output_path, &json).expect("Failed to write shapes.json");
    println!("Wrote shapes to {}", output_path.display());
}
