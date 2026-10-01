use crate::cf::{auth, client::CfClient};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::State;

struct Pending {
    profile: String,
    account: String,
    request: Value,
    fingerprint: String,
    created: Instant,
}
#[derive(Default)]
pub struct Plans(Mutex<HashMap<String, Pending>>);
async fn run(
    client: &CfClient,
    profile: &str,
    account: &str,
    mode: &str,
    request: &Value,
    fingerprint: &str,
) -> Result<Value, String> {
    auth::args("whoami", Some(profile), false)?;
    if account.len() != 32 || !account.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Select a valid account.".into());
    }
    if request.to_string().len() > 16000 {
        return Err("Configuration is too large.".into());
    }
    let runtime = client
        .runtime
        .as_ref()
        .ok_or("Open the desktop app to manage Cloudflare.")?;
    let dist = runtime
        .entry
        .parent()
        .and_then(|p| p.parent())
        .ok_or("CLI path unavailable")?
        .join("dist");
    let output = client
        .runner
        .run(
            &runtime.node,
            &[
                "--input-type=module".into(),
                "-e".into(),
                format!("{}\nawait main();", include_str!("cf/management.mjs")),
                dist.to_string_lossy().into_owned(),
                profile.into(),
                account.into(),
                mode.into(),
                request.to_string(),
                fingerprint.into(),
            ],
            &client.store.dir,
            None,
            Duration::from_secs(180),
            tokio_util::sync::CancellationToken::new(),
            Arc::new(|_, _| {}),
        )
        .await?;
    if output.code != 0 {
        return Err(output.stderr);
    }
    serde_json::from_str(&output.stdout).map_err(|_| "Management response is incompatible.".into())
}
#[tauri::command]
pub async fn management_read(
    profile: String,
    account_id: String,
    request: Value,
    client: State<'_, CfClient>,
) -> Result<Value, String> {
    run(&client, &profile, &account_id, "read", &request, "").await
}
#[tauri::command]
pub async fn management_prepare(
    profile: String,
    account_id: String,
    request: Value,
    client: State<'_, CfClient>,
    plans: State<'_, Plans>,
) -> Result<Value, String> {
    let mut preview = run(&client, &profile, &account_id, "prepare", &request, "").await?;
    let fingerprint = preview["fingerprint"]
        .as_str()
        .ok_or("Invalid review")?
        .to_owned();
    let id = uuid::Uuid::new_v4().to_string();
    let mut pending = plans.0.lock().map_err(|_| "Review unavailable")?;
    pending.retain(|_, p| p.created.elapsed() < Duration::from_secs(600));
    if pending.len() >= 100 {
        return Err("Too many pending reviews.".into());
    }
    pending.insert(
        id.clone(),
        Pending {
            profile,
            account: account_id,
            request,
            fingerprint,
            created: Instant::now(),
        },
    );
    preview.as_object_mut().unwrap().remove("fingerprint");
    preview["id"] = json!(id);
    Ok(preview)
}
#[tauri::command]
pub async fn management_apply(
    id: String,
    profile: String,
    account_id: String,
    confirmed: bool,
    client: State<'_, CfClient>,
    plans: State<'_, Plans>,
) -> Result<Value, String> {
    if !confirmed {
        return Err("Review and confirm this change first.".into());
    }
    let p = plans
        .0
        .lock()
        .map_err(|_| "Review unavailable")?
        .remove(&id)
        .ok_or("Review expired. Prepare it again.")?;
    if p.profile != profile
        || p.account != account_id
        || p.created.elapsed() > Duration::from_secs(600)
    {
        return Err("Account changed or review expired. Review again.".into());
    }
    run(
        &client,
        &p.profile,
        &p.account,
        "apply",
        &p.request,
        &p.fingerprint,
    )
    .await
}
