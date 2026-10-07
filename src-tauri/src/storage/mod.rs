use serde::{de::DeserializeOwned, Serialize};
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::{io::Write, path::PathBuf, sync::Mutex};
pub struct Store {
    pub dir: PathBuf,
    lock: Mutex<()>,
}
impl Store {
    pub fn new(dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&dir);
        #[cfg(unix)]
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
        Self {
            dir,
            lock: Mutex::new(()),
        }
    }
    pub fn read<T: DeserializeOwned>(&self, key: &str) -> Option<T> {
        let _lock = self.lock.lock().ok()?;
        let path = self.dir.join(format!("{key}.json"));
        #[cfg(unix)]
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).ok()?;
        serde_json::from_slice(&std::fs::read(path).ok()?).ok()
    }
    pub fn write<T: Serialize>(&self, key: &str, data: &T) -> Result<(), String> {
        let _lock = self.lock.lock().map_err(|e| e.to_string())?;
        let path = self.dir.join(format!("{key}.json"));
        let tmp = self.dir.join(format!("{key}.tmp"));
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            options.mode(0o600);
            std::fs::set_permissions(&self.dir, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        let mut file = options.open(&tmp).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        file.set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec_pretty(data).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        std::fs::rename(tmp, path).map_err(|e| e.to_string())
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn private_store_permissions_survive_replacement_and_legacy_reads() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let store = Store::new(dir.clone());
        store.write("history", &vec!["first"]).unwrap();
        store.write("history", &vec!["second"]).unwrap();
        let path = dir.join("history.json");
        assert_eq!(
            std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(
            store.read::<Vec<String>>("history").unwrap(),
            vec!["second"]
        );
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
