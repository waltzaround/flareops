//! Resolve application-owned Node and cf without PATH or shell shims.
use std::path::{Path, PathBuf};
#[derive(Clone, Debug)]
pub struct BundledRuntime {
    pub node: PathBuf,
    pub entry: PathBuf,
}
impl BundledRuntime {
    pub fn resolve(
        resources: &Path,
        executable: &Path,
        development: Option<&Path>,
    ) -> Result<Option<Self>, String> {
        let root = resources.join("cf-runtime");
        if root.exists() {
            let node = executable
                .parent()
                .ok_or("Cannot locate application executable")?
                .join(if cfg!(windows) {
                    "flareops-node.exe"
                } else {
                    "flareops-node"
                });
            return Self::at(&root, node).map(Some);
        }
        if let Some(dev) = development {
            let root = dev.join("resources/cf-runtime");
            if root.exists() {
                let name = format!(
                    "flareops-node-{}{}",
                    env!("FLAREOPS_TARGET"),
                    if cfg!(windows) { ".exe" } else { "" }
                );
                return Self::at(&root, dev.join("binaries").join(name)).map(Some);
            }
        }
        Ok(None)
    }
    fn at(root: &Path, node: PathBuf) -> Result<Self, String> {
        let entry = root.join("node_modules/cf/bin/cf");
        if !root.join("manifest.json").is_file() || !node.is_file() || !entry.is_file() {
            return Err("Bundled Cloudflare runtime is incomplete. Reinstall FlareOps; the app will not silently switch to another CLI.".into());
        }
        Ok(Self { node, entry })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_bundle_allows_system_fallback() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        assert!(BundledRuntime::resolve(&dir, &dir.join("flareops"), None)
            .unwrap()
            .is_none());
    }
    #[test]
    fn incomplete_bundle_fails_closed() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(dir.join("cf-runtime")).unwrap();
        assert!(BundledRuntime::resolve(&dir, &dir.join("flareops"), None).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn bundle_resolution_does_not_use_path() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let resources = dir.join("resources");
        let runtime = resources.join("cf-runtime");
        std::fs::create_dir_all(runtime.join("node_modules/cf/bin")).unwrap();
        std::fs::write(runtime.join("manifest.json"), "{}").unwrap();
        std::fs::write(runtime.join("node_modules/cf/bin/cf"), "").unwrap();
        let node = dir.join(if cfg!(windows) {
            "flareops-node.exe"
        } else {
            "flareops-node"
        });
        std::fs::write(&node, "").unwrap();
        let found = BundledRuntime::resolve(&resources, &dir.join("flareops"), None)
            .unwrap()
            .unwrap();
        assert_eq!(found.node, node);
        assert_eq!(found.entry, runtime.join("node_modules/cf/bin/cf"));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
