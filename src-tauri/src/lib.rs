mod cf;
mod management;
mod storage;
use cf::{
    client::{CfClient, Execution},
    schema::{Plan, Request},
};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
#[tauri::command]
async fn system_check(client: State<'_, CfClient>) -> Result<Value, String> {
    let node = client
        .runtime
        .as_ref()
        .map(|r| r.node.clone())
        .or_else(|| cf::process::find_binary("node"));
    let node_version = if let Some(n) = &node {
        tokio::process::Command::new(n)
            .arg("--version")
            .output()
            .await
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    } else {
        None
    };
    let binary = client
        .runtime
        .as_ref()
        .map(|r| r.entry.clone())
        .or_else(|| client.binary.clone());
    let source = if client.runtime.is_some() {
        "bundled"
    } else if binary.is_some() {
        "system"
    } else {
        "missing"
    };
    let version = if binary.is_some() {
        let result = client.simple(vec!["--version".into()], false).await;
        if result.success {
            Some(cf::version::parse(&result.raw_stdout)?)
        } else {
            None
        }
    } else {
        None
    };
    Ok(
        json!({"os":std::env::consts::OS,"nodeVersion":node_version,"binary":binary,"version":version,"supportedRange":"1.0.0-beta.x","minimumNode":"22.18.0","source":source,"runtimeBinary":node}),
    )
}
#[tauri::command]
async fn profiles(client: State<'_, CfClient>) -> Result<Execution, String> {
    Ok(client
        .simple(vec!["auth".into(), "list".into()], true)
        .await)
}
#[tauri::command]
async fn accounts(profile: String, client: State<'_, CfClient>) -> Result<Execution, String> {
    if profile.is_empty() || profile.starts_with('-') {
        return Err("Select a profile".into());
    }
    Ok(client
        .simple(
            vec![
                "accounts".into(),
                "list".into(),
                "--profile".into(),
                profile,
            ],
            true,
        )
        .await)
}
#[tauri::command]
async fn worker_traffic(
    profile: String,
    account_id: String,
    client: State<'_, CfClient>,
) -> Result<Value, String> {
    cf::auth::args("whoami", Some(&profile), false)?;
    if account_id.len() != 32 || !account_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Select a valid Cloudflare account.".into());
    }
    let runtime = client
        .runtime
        .as_ref()
        .ok_or("Traffic analytics requires the bundled desktop runtime.")?;
    let dist = runtime
        .entry
        .parent()
        .and_then(|p| p.parent())
        .ok_or("Bundled CLI path unavailable.")?
        .join("dist");
    let result = client
        .runner
        .run(
            &runtime.node,
            &[
                "--input-type=module".into(),
                "-e".into(),
                include_str!("cf/worker-traffic.mjs").into(),
                dist.to_string_lossy().into_owned(),
                profile,
                account_id,
            ],
            &client.store.dir,
            None,
            std::time::Duration::from_secs(45),
            tokio_util::sync::CancellationToken::new(),
            Arc::new(|_, _| {}),
        )
        .await?;
    if result.code != 0 {
        return Err(if result.stderr.trim().is_empty() {
            "Traffic analytics unavailable.".into()
        } else {
            result.stderr
        });
    }
    serde_json::from_str(&result.stdout)
        .map_err(|_| "Traffic analytics response is incompatible.".into())
}
#[tauri::command]
async fn account_read(
    profile: String,
    account_id: String,
    kind: String,
    options: Value,
    client: State<'_, CfClient>,
) -> Result<Value, String> {
    if !["tokens", "agents"].contains(&kind.as_str()) || options.to_string().len() > 5000 {
        return Err("Invalid account read options.".into());
    }
    cf::auth::args("whoami", Some(&profile), false)?;
    if account_id.len() != 32 || !account_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Select a valid Cloudflare account.".into());
    }
    let runtime = client
        .runtime
        .as_ref()
        .ok_or("Account data requires the bundled desktop runtime.")?;
    let dist = runtime
        .entry
        .parent()
        .and_then(|p| p.parent())
        .ok_or("Bundled CLI path unavailable.")?
        .join("dist");
    let result = client
        .runner
        .run(
            &runtime.node,
            &[
                "--input-type=module".into(),
                "-e".into(),
                format!("{}\nawait main();", include_str!("cf/account-reads.mjs")),
                dist.to_string_lossy().into_owned(),
                profile,
                account_id,
                kind,
                options.to_string(),
            ],
            &client.store.dir,
            None,
            std::time::Duration::from_secs(95),
            tokio_util::sync::CancellationToken::new(),
            Arc::new(|_, _| {}),
        )
        .await?;
    if result.code != 0 {
        return Err(if result.stderr.trim().is_empty() {
            "Account data unavailable.".into()
        } else {
            result.stderr
        });
    }
    serde_json::from_str(&result.stdout)
        .map_err(|_| "Account data response is incompatible.".into())
}
#[tauri::command]
async fn site_analytics(
    profile: String,
    account_id: String,
    kind: String,
    hours: u32,
    host: String,
    client: State<'_, CfClient>,
) -> Result<Value, String> {
    if !["account", "web", "stream"].contains(&kind.as_str()) || ![24, 168].contains(&hours) || host.len() > 253 {
        return Err("Invalid analytics options.".into());
    }
    cf::auth::args("whoami", Some(&profile), false)?;
    if account_id.len() != 32 || !account_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Select a valid Cloudflare account.".into());
    }
    let runtime = client
        .runtime
        .as_ref()
        .ok_or("Traffic analytics requires the bundled desktop runtime.")?;
    let dist = runtime
        .entry
        .parent()
        .and_then(|p| p.parent())
        .ok_or("Bundled CLI path unavailable.")?
        .join("dist");
    let result = client
        .runner
        .run(
            &runtime.node,
            &[
                "--input-type=module".into(),
                "-e".into(),
                format!("{}\nawait main();", include_str!("cf/site-analytics.mjs")),
                dist.to_string_lossy().into_owned(),
                profile,
                account_id,
                kind,
                hours.to_string(),
                host,
            ],
            &client.store.dir,
            None,
            std::time::Duration::from_secs(95),
            tokio_util::sync::CancellationToken::new(),
            Arc::new(|_, _| {}),
        )
        .await?;
    if result.code != 0 {
        return Err(if result.stderr.trim().is_empty() {
            "Traffic analytics unavailable.".into()
        } else {
            result.stderr
        });
    }
    serde_json::from_str(&result.stdout)
        .map_err(|_| "Traffic analytics response is incompatible.".into())
}
#[tauri::command]
async fn worker_crons(
    profile: String,
    account_id: String,
    client: State<'_, CfClient>,
) -> Result<Value, String> {
    cf::auth::args("whoami", Some(&profile), false)?;
    if account_id.len() != 32 || !account_id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Select a valid Cloudflare account.".into());
    }
    let runtime = client
        .runtime
        .as_ref()
        .ok_or("Worker cron triggers requires the bundled desktop runtime.")?;
    let dist = runtime
        .entry
        .parent()
        .and_then(|p| p.parent())
        .ok_or("Bundled CLI path unavailable.")?
        .join("dist");
    let result = client
        .runner
        .run(
            &runtime.node,
            &[
                "--input-type=module".into(),
                "-e".into(),
                format!("{}\nawait main();", include_str!("cf/worker-crons.mjs")),
                dist.to_string_lossy().into_owned(),
                profile,
                account_id,
            ],
            &client.store.dir,
            None,
            std::time::Duration::from_secs(100),
            tokio_util::sync::CancellationToken::new(),
            Arc::new(|_, _| {}),
        )
        .await?;
    if result.code != 0 {
        return Err(if result.stderr.trim().is_empty() {
            "Worker cron triggers unavailable.".into()
        } else {
            result.stderr
        });
    }
    serde_json::from_str(&result.stdout)
        .map_err(|_| "Worker cron triggers response is incompatible.".into())
}
#[tauri::command]
async fn discover(query: String, client: State<'_, CfClient>) -> Result<Execution, String> {
    if query.is_empty() || query.len() > 500 || query.starts_with('-') {
        return Err("Enter a task (up to 500 characters).".into());
    }
    Ok(client
        .simple(vec!["cli".into(), "search".into(), query], true)
        .await)
}
#[tauri::command]
async fn command_schema(path: Vec<String>, client: State<'_, CfClient>) -> Result<Value, String> {
    client.schema(path).await
}
#[tauri::command]
async fn prepare(request: Request, client: State<'_, CfClient>) -> Result<Plan, String> {
    client.prepare(request).await
}
#[tauri::command]
async fn run_plan(
    id: String,
    confirmed: bool,
    dry_run: bool,
    app: tauri::AppHandle,
    client: State<'_, CfClient>,
) -> Result<Execution, String> {
    let job = id.clone();
    client
        .run_plan(
            id,
            confirmed,
            dry_run,
            Arc::new(move |stream, text| {
                let _ = app.emit("cf-output", json!({"id":job,"stream":stream,"text":text}));
            }),
        )
        .await
}
#[tauri::command]
fn cancel(id: String, client: State<'_, CfClient>) -> Result<(), String> {
    if let Some(t) = client.jobs.lock().unwrap().get(&id) {
        t.cancel();
        Ok(())
    } else {
        Err("This command has already finished.".into())
    }
}
#[tauri::command]
fn history(account_id: String, profile: String, client: State<'_, CfClient>) -> Vec<Execution> {
    client.history.lock().unwrap().iter().filter(|entry| entry.in_scope(&account_id, &profile)).cloned().collect()
}
#[tauri::command]
fn clear_history(account_id: String, profile: String, client: State<'_, CfClient>) -> Result<(), String> {
    let mut history = client.history.lock().map_err(|e| e.to_string())?;
    let retained: Vec<_> = history.iter().filter(|entry| !entry.in_scope(&account_id, &profile)).cloned().collect();
    client.store.write("history", &retained)?;
    *history = retained;
    Ok(())
}
#[tauri::command]
async fn auth_action(
    id: String,
    action: String,
    name: Option<String>,
    confirmed: bool,
    client: State<'_, CfClient>,
) -> Result<Execution, String> {
    // The localhost OAuth callback is shared; only one auth action may run at a time.
    static AUTH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _guard = AUTH_LOCK
        .try_lock()
        .map_err(|_| "Another sign-in is in progress. Complete or cancel it first.")?;
    let args = cf::auth::args(&action, name.as_deref(), confirmed)?;
    let context = cf::schema::Context {
        profile: name.unwrap_or_else(|| "default".into()),
        account_id: String::new(),
        zone_id: None,
    };
    Ok(client
        .execute(args, id, Some(&context), false, Arc::new(|_, _| {}))
        .await)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let mut client = CfClient::new(dir);
            let development = if cfg!(debug_assertions) {
                Some(std::path::Path::new(env!("CARGO_MANIFEST_DIR")))
            } else {
                None
            };
            let runtime = cf::runtime::BundledRuntime::resolve(
                &app.path().resource_dir()?,
                &std::env::current_exe()?,
                development,
            )
            .map_err(std::io::Error::other)?;
            if let Some(runtime) = runtime {
                client.binary = Some(runtime.node.clone());
                client.runtime = Some(runtime);
            }
            if !cfg!(debug_assertions) && client.runtime.is_none() {
                return Err(std::io::Error::other("Bundled Cloudflare runtime missing. Reinstall FlareOps.").into());
            }
            app.manage(client);
            app.manage(management::Plans::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            management::management_read,
            management::management_prepare,
            management::management_apply,
            system_check,
            profiles,
            accounts,
            discover,
            command_schema,
            prepare,
            run_plan,
            cancel,
            history,
            clear_history,
            auth_action,
            worker_traffic,
            site_analytics,
            account_read,
            worker_crons
        ])
        .run(tauri::generate_context!())
        .expect("failed to launch FlareOps");
}
