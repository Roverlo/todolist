fn main() {
    println!("cargo:rerun-if-changed=vendor/aria2/aria2c.exe");
    assert!(std::path::Path::new("vendor/aria2/aria2c.exe").exists(), "Run npm run engine:prepare in app/ before building the Windows application");
    tauri_build::build()
}
