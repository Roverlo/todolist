fn main() {
    println!("cargo:rerun-if-changed=../dist/build-info.json");
    let info: serde_json::Value = serde_json::from_str(&std::fs::read_to_string("../dist/build-info.json").expect("Run npm run build first")).expect("Invalid build info");
    println!("cargo:rustc-env=PROJECTTODO_BUILD_VERSION={}", info["version"].as_str().expect("Missing build version"));
    println!("cargo:rerun-if-changed=vendor/aria2/aria2c.exe");
    assert!(std::path::Path::new("vendor/aria2/aria2c.exe").exists(), "Run npm run engine:prepare in app/ before building the Windows application");
    tauri_build::build()
}
