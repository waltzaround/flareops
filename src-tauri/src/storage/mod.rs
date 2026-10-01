use serde::{de::DeserializeOwned, Serialize};
use std::{path::PathBuf, sync::Mutex};
pub struct Store {
    pub dir: PathBuf,
    lock: Mutex<()>,
}
impl Store {
    pub fn new(dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&dir);
        Self {
            dir,
            lock: Mutex::new(()),
        }
    }
    pub fn read<T: DeserializeOwned>(&self, key: &str) -> Option<T> {
        let _lock = self.lock.lock().ok()?;
        serde_json::from_slice(&std::fs::read(self.dir.join(format!("{key}.json"))).ok()?).ok()
    }
    pub fn write<T: Serialize>(&self, key: &str, data: &T) -> Result<(), String> {
        let _lock = self.lock.lock().map_err(|e| e.to_string())?;
        let path = self.dir.join(format!("{key}.json"));
        let tmp = self.dir.join(format!("{key}.tmp"));
        std::fs::write(
            &tmp,
            serde_json::to_vec_pretty(data).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        std::fs::rename(tmp, path).map_err(|e| e.to_string())
    }
}
