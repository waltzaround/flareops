fn main() {
    println!(
        "cargo:rustc-env=FLAREOPS_TARGET={}",
        std::env::var("TARGET").unwrap()
    );
    tauri_build::build()
}
