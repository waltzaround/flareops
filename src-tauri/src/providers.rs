//! Provider secrets stay in the OS credential store and are never returned to the webview.
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialScope {
    account_id: String,
    profile: String,
    provider: String,
    endpoint: String,
}
impl CredentialScope {
    fn identity(&self) -> Result<String, String> {
        if self.account_id.is_empty()
            || self.profile.is_empty()
            || self.account_id.len() > 128
            || self.profile.len() > 128
            || !matches!(
                self.provider.as_str(),
                "cloudflare" | "openai" | "anthropic" | "compatible"
            )
        {
            return Err("Invalid provider scope.".into());
        }
        if self.provider == "compatible" {
            let url = tauri::Url::parse(&self.endpoint).map_err(|_| "Invalid API base URL.")?;
            let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
            if !(url.scheme() == "https" || (url.scheme() == "http" && local))
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
                || self.endpoint.len() > 2048
            {
                return Err("Use HTTPS or localhost without URL credentials.".into());
            }
        } else if !self.endpoint.is_empty() {
            return Err("Custom endpoints require the compatible provider.".into());
        }
        serde_json::to_string(&(
            &self.account_id,
            &self.profile,
            &self.provider,
            &self.endpoint,
        ))
        .map_err(|_| "Invalid provider scope.".into())
    }
}

// Single lock also prevents overlapping writes/deletes from multiple windows.
static CREDENTIAL_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
#[tauri::command]
pub async fn provider_credential(
    scope: CredentialScope,
    action: String,
    secret: Option<String>,
) -> Result<bool, String> {
    let identity = scope.identity()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = CREDENTIAL_LOCK
            .lock()
            .map_err(|_| "Credential store unavailable.")?;
        let entry = keyring::Entry::new("FlareOps AI providers", &identity)
            .map_err(|_| "Could not open the OS credential store.")?;
        match action.as_str() {
            "status" => match entry.get_password() {
                Ok(_) => Ok(true),
                Err(keyring::Error::NoEntry) => Ok(false),
                Err(_) => {
                    Err("Could not read the OS credential store. Unlock it and try again.".into())
                }
            },
            "save" => {
                let secret = secret
                    .filter(|s| !s.trim().is_empty() && s.len() <= 8192)
                    .ok_or("Enter an API key.")?;
                entry
                    .set_password(secret.trim())
                    .map_err(|_| "Could not save the API key in the OS credential store.")?;
                Ok(true)
            }
            "remove" => match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(false),
                Err(_) => Err("Could not remove the API key from the OS credential store.".into()),
            },
            _ => Err("Invalid credential action.".into()),
        }
    })
    .await
    .map_err(|_| "Credential operation failed.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scope() -> CredentialScope {
        CredentialScope {
            account_id: "account".into(),
            profile: "profile".into(),
            provider: "openai".into(),
            endpoint: "".into(),
        }
    }
    #[test]
    fn isolates_account_profile_provider_and_endpoint() {
        let original = scope().identity().unwrap();
        let mut other = scope();
        other.profile = "other".into();
        assert_ne!(original, other.identity().unwrap());
        other = scope();
        other.account_id = "other".into();
        assert_ne!(original, other.identity().unwrap());
        other = scope();
        other.provider = "anthropic".into();
        assert_ne!(original, other.identity().unwrap());
        other.provider = "compatible".into();
        other.endpoint = "https://example.com/v1".into();
        let first = other.identity().unwrap();
        other.endpoint = "https://another.example/v1".into();
        assert_ne!(first, other.identity().unwrap());
    }
    #[test]
    fn rejects_unsafe_endpoints() {
        let mut s = scope();
        s.provider = "compatible".into();
        for endpoint in [
            "http://example.com",
            "https://user:secret@example.com",
            "https://example.com?key=secret",
            "file:///tmp/test",
        ] {
            s.endpoint = endpoint.into();
            assert!(s.identity().is_err());
        }
        s.endpoint = "http://localhost:11434/v1".into();
        assert!(s.identity().is_ok());
    }
}
