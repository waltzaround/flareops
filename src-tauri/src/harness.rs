use serde::Deserialize;
use serde_json::{json, Value};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scope {
    account_id: String,
    profile: String,
    endpoint: String,
}
impl Scope {
    fn validate(&self) -> Result<String, String> {
        if self.account_id.len() != 32 || !self.account_id.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("Choose a live Cloudflare account.".into());
        }
        crate::cf::auth::args("whoami", Some(&self.profile), false)?;
        let url = reqwest::Url::parse(&self.endpoint).map_err(|_| "Enter a valid backend URL.")?;
        if url.scheme() != "https"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || url.path() != "/"
        {
            return Err("Use an HTTPS backend origin without a path or credentials.".into());
        }
        Ok(url.origin().ascii_serialization())
    }
    fn identity(&self, endpoint: &str) -> String {
        json!([self.account_id, self.profile, endpoint]).to_string()
    }
}
async fn request(
    scope: &Scope,
    endpoint: &str,
    token: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not create connection.")?;
    let mut req = if body.is_some() {
        client.post(format!("{endpoint}{path}"))
    } else {
        client.get(format!("{endpoint}{path}"))
    };
    req = req
        .bearer_auth(token)
        .header("X-FlareOps-Account", &scope.account_id)
        .header("X-FlareOps-Profile", &scope.profile);
    if let Some(body) = body {
        req = req.json(&body);
    }
    let response = req
        .send()
        .await
        .map_err(|_| "Backend connection failed. Check the URL and network.")?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.json::<Value>().await.unwrap_or(Value::Null);
        if let Some(message) = body["error"].as_str() {
            if [
                "Account concurrency limit reached. Wait for an active run to finish.",
                "This model has no configured budget pricing.",
                "Wait for the current operation to stop.",
                "Invalid budget settings",
                "A completed review is required for a preview.",
                "This revision has no preview bundle. Ask the agent to build .flareops/preview/worker.js.",
                "Preview bundle is missing or exceeds 2 MB.",
            ]
            .contains(&message)
            {
                return Err(message.to_string());
            }
        }
        return Err(format!(
            "Backend returned {status}. Check account, credentials, or project status."
        ));
    }
    response
        .json()
        .await
        .map_err(|_| "Backend returned an invalid response.".into())
}
// Serializes setup within the desktop so duplicate clicks cannot rotate credentials.
static SETUP_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
#[tauri::command]
pub async fn harness_setup(
    account_id: String,
    profile: String,
    on_progress: tauri::ipc::Channel<String>,
    upgrade: Option<bool>,
    app: tauri::AppHandle,
    client: tauri::State<'_, crate::cf::client::CfClient>,
) -> Result<Value, String> {
    use tauri::Manager;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let _guard = SETUP_LOCK
        .try_lock()
        .map_err(|_| "Backend setup is already running. Wait for it to finish.")?;
    crate::cf::auth::args("whoami", Some(&profile), false)?;
    if account_id.len() != 32 || !account_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Choose a live Cloudflare account.".into());
    }
    let runtime = client
        .runtime
        .as_ref()
        .ok_or("Backend setup requires the bundled desktop runtime.")?;
    let dist = runtime
        .entry
        .parent()
        .and_then(|p| p.parent())
        .ok_or("Bundled CLI unavailable.")?
        .join("dist");
    let mut root = app
        .path()
        .resource_dir()
        .map_err(|_| "Application resources unavailable.")?
        .join("harness-runtime");
    if cfg!(debug_assertions) && !root.exists() {
        root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or("Development directory unavailable.")?
            .join("harness");
    }
    if !root.join("node_modules/wrangler/bin/wrangler.js").is_file()
        || !root.join("src/index.ts").is_file()
    {
        return Err("Backend deployment runtime is missing. Rebuild with npm run desktop:build (development: npm ci --prefix harness).".into());
    }
    let identity = json!([account_id, profile]).to_string();
    // Save BEFORE deploying. Retry can recover after timeout or partial deployment.
    let token = tauri::async_runtime::spawn_blocking(move || {
        let entry = keyring::Entry::new("FlareOps backend setup", &identity)
            .map_err(|_| "OS credential store unavailable.")?;
        match entry.get_password() {
            Ok(token) => Ok(token),
            Err(keyring::Error::NoEntry) => {
                let token = format!(
                    "{}{}",
                    uuid::Uuid::new_v4().simple(),
                    uuid::Uuid::new_v4().simple()
                );
                entry
                    .set_password(&token)
                    .map_err(|_| "Could not save backend credentials. Nothing was deployed.")?;
                Ok(token)
            }
            Err(_) => Err("Could not read saved setup credentials. Nothing was deployed."),
        }
    })
    .await
    .map_err(|_| "Credential operation failed.")??;
    let mut command = tokio::process::Command::new(&runtime.node);
    command.args([
        "--input-type=module".into(),
        "-e".into(),
        format!("{}\nawait main();", include_str!("cf/harness-setup.mjs")),
        dist.to_string_lossy().into_owned(),
        root.to_string_lossy().into_owned(),
        profile.clone(),
        account_id.clone(),
    ]);
    command
        .current_dir(&client.store.dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    for (key, _) in std::env::vars() {
        if key.starts_with("CLOUDFLARE_")
            || key.starts_with("CF_")
            || key.starts_with("WRANGLER_")
            || key == "NODE_OPTIONS"
            || key == "NODE_PATH"
        {
            command.env_remove(key);
        }
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Could not start backend setup.")?;
    let mut input = child.stdin.take().ok_or("Setup input unavailable.")?;
    input
        .write_all(
            json!({ "token": token, "upgrade": upgrade.unwrap_or(false) })
                .to_string()
                .as_bytes(),
        )
        .await
        .map_err(|_| "Could not provide setup credentials.")?;
    drop(input);
    let mut lines = BufReader::new(child.stdout.take().ok_or("Setup output unavailable.")?).lines();
    let result = tokio::time::timeout(std::time::Duration::from_secs(30 * 60), async {
        let mut result = None;
        let mut error = None;
        while let Some(line) = lines
            .next_line()
            .await
            .map_err(|_| "Setup output interrupted.")?
        {
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                if let Some(progress) = value["progress"].as_str() {
                    let _ = on_progress.send(progress.to_string());
                }
                if value.get("result").is_some() {
                    result = Some(value["result"].clone());
                }
                if let Some(message) = value["error"].as_str() {
                    error = Some(message.to_string());
                }
            }
        }
        let status = child.wait().await.map_err(|_| "Could not finish setup.")?;
        if !status.success() {
            return Err(error.unwrap_or("Backend setup failed. Retry to resume.".into()));
        }
        result.ok_or("Backend setup returned no result.".to_string())
    })
    .await
    .map_err(|_| "Backend setup timed out. Retry to check and resume the deployment.")??;
    let endpoint = result["endpoint"]
        .as_str()
        .ok_or("Backend endpoint unavailable.")?
        .to_string();
    harness_connect(
        Scope {
            account_id,
            profile,
            endpoint,
        },
        token,
    )
    .await?;
    Ok(result)
}
#[tauri::command]
pub async fn harness_discover(
    account_id: String,
    profile: String,
    client: tauri::State<'_, crate::cf::client::CfClient>,
) -> Result<Value, String> {
    crate::cf::auth::args("whoami", Some(&profile), false)?;
    if account_id.len() != 32 || !account_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Choose a live Cloudflare account.".into());
    }
    let runtime = client
        .runtime
        .as_ref()
        .ok_or("Backend discovery requires the bundled desktop runtime.")?;
    let dist = runtime
        .entry
        .parent()
        .and_then(|p| p.parent())
        .ok_or("Bundled CLI path unavailable.")?
        .join("dist");
    let output = client
        .runner
        .run(
            &runtime.node,
            &[
                "--input-type=module".into(),
                "-e".into(),
                format!(
                    "{}\nawait main();",
                    include_str!("cf/harness-discovery.mjs")
                ),
                dist.to_string_lossy().into_owned(),
                profile.clone(),
                account_id.clone(),
            ],
            &client.store.dir,
            None,
            std::time::Duration::from_secs(95),
            tokio_util::sync::CancellationToken::new(),
            std::sync::Arc::new(|_, _| {}),
        )
        .await?;
    if output.code != 0 {
        return Err(if output.stderr.trim().is_empty() {
            "Backend discovery failed.".into()
        } else {
            output.stderr
        });
    }
    let mut result: Value = serde_json::from_str(&output.stdout)
        .map_err(|_| "Backend discovery returned an invalid response.")?;
    if let Some(endpoint) = result["endpoint"].as_str() {
        let scope = Scope {
            account_id,
            profile,
            endpoint: endpoint.into(),
        };
        // Reconnect only after both Cloudflare account verification and Worker health validation.
        result["connected"] = json!(harness_request(scope, "health".into(), None, None)
            .await
            .map(|health| health["accountId"] == result["accountId"] && health["version"] == 1)
            .unwrap_or(false));
    }
    Ok(result)
}
#[tauri::command]
pub async fn harness_connect(scope: Scope, token: String) -> Result<Value, String> {
    let endpoint = scope.validate()?;
    if token.trim().len() < 32 || token.len() > 8192 {
        return Err("Enter the backend access token (at least 32 characters).".into());
    }
    let health = request(&scope, &endpoint, token.trim(), "/health", None).await?;
    if health["accountId"].as_str() != Some(&scope.account_id)
        || health["version"].as_u64() != Some(1)
    {
        return Err("Backend account or version does not match.".into());
    }
    let identity = scope.identity(&endpoint);
    tauri::async_runtime::spawn_blocking(move || {
        keyring::Entry::new("FlareOps harness", &identity)
            .and_then(|e| e.set_password(token.trim()))
            .map_err(|_| "Could not save the backend token in the OS credential store.".to_string())
    })
    .await
    .map_err(|_| "Credential operation failed.")??;
    Ok(health)
}
#[tauri::command]
pub async fn harness_request(
    scope: Scope,
    action: String,
    project_id: Option<String>,
    body: Option<Value>,
) -> Result<Value, String> {
    let endpoint = scope.validate()?;
    let path = if ["budget_status", "budget_update"].contains(&action.as_str()) {
        "/budget".to_string()
    } else if action == "health" {
        "/health".to_string()
    } else {
        if ![
            "start",
            "import",
            "status",
            "cancel",
            "merge",
            "preview-artifact",
        ]
        .contains(&action.as_str())
        {
            return Err("Unsupported project action.".into());
        }
        let id = project_id.ok_or("Choose a project.")?;
        uuid::Uuid::parse_str(&id).map_err(|_| "Invalid project ID.")?;
        format!("/projects/{id}/{action}")
    };
    let identity = scope.identity(&endpoint);
    let token = tauri::async_runtime::spawn_blocking(move || {
        keyring::Entry::new("FlareOps harness", &identity)
            .and_then(|e| e.get_password())
            .map_err(|_| "Connect the agent backend for this account first.".to_string())
    })
    .await
    .map_err(|_| "Credential operation failed.")??;
    let payload =
        if ["status", "health", "budget_status", "preview-artifact"].contains(&action.as_str()) {
            None
        } else {
            Some(body.unwrap_or(json!({})))
        };
    request(&scope, &endpoint, &token, &path, payload).await
}
#[tauri::command]
pub async fn harness_preview(
    scope: Scope,
    project_id: String,
    head: String,
    action: String,
    app: tauri::AppHandle,
    client: tauri::State<'_, crate::cf::client::CfClient>,
) -> Result<Value, String> {
    use tauri::Manager;
    use tokio::io::AsyncWriteExt;
    scope.validate()?;
    uuid::Uuid::parse_str(&project_id).map_err(|_| "Invalid project ID.")?;
    if head.len() != 40
        || !head.bytes().all(|c| c.is_ascii_hexdigit())
        || !["deploy", "status", "delete", "delete-data"].contains(&action.as_str())
    {
        return Err("Invalid preview action.".into());
    }
    let artifact = if action == "deploy" {
        let artifact = harness_request(
            Scope {
                account_id: scope.account_id.clone(),
                profile: scope.profile.clone(),
                endpoint: scope.endpoint.clone(),
            },
            "preview-artifact".into(),
            Some(project_id.clone()),
            None,
        )
        .await?;
        if artifact["head"].as_str() != Some(&head) {
            return Err("The review changed. Refresh before deploying a preview.".into());
        }
        artifact
    } else {
        json!({})
    };
    let runtime = client
        .runtime
        .as_ref()
        .ok_or("Preview deployment requires the bundled desktop runtime.")?;
    let dist = runtime
        .entry
        .parent()
        .and_then(|p| p.parent())
        .ok_or("Bundled CLI unavailable.")?
        .join("dist");
    let mut root = app
        .path()
        .resource_dir()
        .map_err(|_| "Application resources unavailable.")?
        .join("harness-runtime");
    if cfg!(debug_assertions) && !root.exists() {
        root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or("Development path unavailable.")?
            .join("harness");
    }
    let mut command = tokio::process::Command::new(&runtime.node);
    command.args([
        "--input-type=module".into(),
        "-e".into(),
        format!("{}\nawait main();", include_str!("cf/project-preview.mjs")),
        dist.to_string_lossy().into_owned(),
        root.to_string_lossy().into_owned(),
        scope.account_id,
        scope.profile,
        project_id,
        head,
        action,
    ]);
    command
        .current_dir(&client.store.dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    for (key, _) in std::env::vars() {
        if key.starts_with("CLOUDFLARE_")
            || key.starts_with("CF_")
            || key.starts_with("WRANGLER_")
            || key == "NODE_OPTIONS"
            || key == "NODE_PATH"
        {
            command.env_remove(key);
        }
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Could not start preview operation.")?;
    let mut input = child.stdin.take().ok_or("Preview input unavailable.")?;
    input
        .write_all(artifact.to_string().as_bytes())
        .await
        .map_err(|_| "Could not send preview bundle.")?;
    drop(input);
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(300),
        child.wait_with_output(),
    )
    .await
    .map_err(|_| "Preview operation timed out. Refresh preview status before retrying.")?
    .map_err(|_| "Preview operation interrupted.")?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr)
            .chars()
            .take(2000)
            .collect());
    }
    serde_json::from_slice(&output.stdout).map_err(|_| "Preview response is incompatible.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_connection_boundaries() {
        let mut s = Scope {
            account_id: "a".repeat(32),
            profile: "personal".into(),
            endpoint: "https://agents.example.com".into(),
        };
        assert_eq!(s.validate().unwrap(), "https://agents.example.com");
        for endpoint in [
            "http://agents.example.com",
            "https://user:secret@example.com",
            "https://example.com/path",
            "https://example.com?token=x",
        ] {
            s.endpoint = endpoint.into();
            assert!(s.validate().is_err());
        }
    }
}
