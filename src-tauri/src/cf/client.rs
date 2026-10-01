use super::{
    parser::{error_message, safe_output},
    process::{find_binary, OutputSink, Runner, SystemRunner},
    schema::{build_args, display_command, valid_path, Plan, Request},
};
use crate::storage::Store;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio_util::sync::CancellationToken;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Execution {
    pub id: String,
    pub success: bool,
    pub data: Option<Value>,
    pub raw_stdout: String,
    pub raw_stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub command: String,
    pub profile: String,
    pub account_id: String,
    pub zone_id: Option<String>,
    pub started_at: String,
    pub finished_at: String,
    pub error: Option<String>,
}
pub struct CfClient {
    pub store: Store,
    pub binary: Option<std::path::PathBuf>,
    pub runtime: Option<super::runtime::BundledRuntime>,
    pub runner: Arc<dyn Runner>,
    pub plans: Mutex<HashMap<String, Plan>>,
    pub jobs: Mutex<HashMap<String, CancellationToken>>,
    pub history: Mutex<Vec<Execution>>,
    pub dry_runs: Mutex<HashMap<String, bool>>,
    active_plans: Mutex<HashSet<String>>,
}
impl CfClient {
    pub fn new(dir: std::path::PathBuf) -> Self {
        let store = Store::new(dir);
        let history = store.read("history").unwrap_or_default();
        Self {
            store,
            binary: find_binary("cf"),
            runtime: None,
            runner: Arc::new(SystemRunner),
            plans: Mutex::new(HashMap::new()),
            jobs: Mutex::new(HashMap::new()),
            history: Mutex::new(history),
            dry_runs: Mutex::new(HashMap::new()),
            active_plans: Mutex::new(HashSet::new()),
        }
    }
    pub async fn execute(
        &self,
        args: Vec<String>,
        id: String,
        context: Option<&super::schema::Context>,
        json_required: bool,
        sink: OutputSink,
    ) -> Execution {
        let started_at = Utc::now().to_rfc3339();
        let start = Instant::now();
        let token = CancellationToken::new();
        self.jobs.lock().unwrap().insert(id.clone(), token.clone());
        let mut process_args = Vec::new();
        if let Some(runtime) = &self.runtime {
            process_args.push(runtime.entry.to_string_lossy().into_owned());
        }
        process_args.extend(args.clone());
        let result = if let Some(binary) = &self.binary {
            self.runner
                .run(
                    binary,
                    &process_args,
                    &self.store.dir,
                    context,
                    Duration::from_secs(
                        if args.first().map(String::as_str) == Some("auth")
                            && matches!(args.get(1).map(String::as_str), Some("create" | "login"))
                        {
                            600
                        } else {
                            120
                        },
                    ),
                    token,
                    sink,
                )
                .await
        } else {
            Err("Bundled Cloudflare runtime unavailable. Reinstall or rebuild FlareOps.".into())
        };
        self.jobs.lock().unwrap().remove(&id);
        let (mut code, mut stdout, mut stderr, mut error) =
            (-1, String::new(), String::new(), None);
        match result {
            Ok(o) => {
                code = o.code;
                stdout = safe_output(&o.stdout);
                stderr = safe_output(&o.stderr);
                if code != 0 {
                    error = Some(error_message(&stderr));
                }
            }
            Err(e) => error = Some(e),
        };
        let data = serde_json::from_str::<Value>(&stdout).ok();
        if code == 0 && json_required && data.is_none() {
            error=Some("CLI output incompatible: expected JSON. Raw output is preserved in technical details.".into());
        }
        let e = Execution {
            id,
            success: code == 0 && error.is_none(),
            data,
            raw_stdout: stdout,
            raw_stderr: stderr,
            exit_code: code,
            duration_ms: start.elapsed().as_millis() as u64,
            command: safe_output(&display_command(&args)),
            profile: context.map(|c| c.profile.clone()).unwrap_or_default(),
            account_id: context.map(|c| c.account_id.clone()).unwrap_or_default(),
            zone_id: context.and_then(|c| c.zone_id.clone()),
            started_at,
            finished_at: Utc::now().to_rfc3339(),
            error,
        };
        let mut history = self.history.lock().unwrap();
        history.insert(0, e.clone());
        history.truncate(200);
        let _ = self.store.write("history", &*history);
        e
    }
    pub async fn simple(&self, args: Vec<String>, json_required: bool) -> Execution {
        self.execute(
            args,
            uuid::Uuid::new_v4().to_string(),
            None,
            json_required,
            Arc::new(|_, _| {}),
        )
        .await
    }
    async fn scoped(&self, args: Vec<String>, context: &super::schema::Context) -> Execution {
        self.execute(
            args,
            uuid::Uuid::new_v4().to_string(),
            Some(context),
            true,
            Arc::new(|_, _| {}),
        )
        .await
    }
    pub async fn schema(&self, path: Vec<String>) -> Result<Value, String> {
        if !valid_path(&path) {
            return Err("Invalid command path.".into());
        }
        let v = self.simple(vec!["--version".into()], false).await;
        if !v.success {
            return Err(v.error.unwrap_or_default());
        }
        let version = super::version::parse(&v.raw_stdout)?;
        let key = format!("schema-{}", path.join("__"));
        if let Some(cached) = self.store.read::<Value>(&key) {
            if cached["version"] == version {
                return Ok(cached["schema"].clone());
            }
        }
        let mut args = vec!["schema".into()];
        args.extend(path.clone());
        let e = self.simple(args, true).await;
        if !e.success {
            let mut help = path;
            help.push("--help".into());
            let fallback = self.simple(help, false).await;
            return Err(format!(
                "Schema unavailable; command execution disabled.\n{}",
                fallback.raw_stdout
            ));
        }
        let schema = e.data.unwrap_or(Value::Null);
        if !schema["httpMethod"].is_string() {
            return Err("CLI schema incompatible. Update cf or FlareOps.".into());
        }
        self.store.write(
            &key,
            &json!({"version":version,"retrievedAt":Utc::now().to_rfc3339(),"schema":schema}),
        )?;
        Ok(schema)
    }
    pub async fn prepare(&self, r: Request) -> Result<Plan, String> {
        let schema = self.schema(r.path.clone()).await?;
        let (args, classification) = build_args(&r, &schema)?;
        let mut help = r.path.clone();
        help.push("--help".into());
        let h = self.simple(help, false).await;
        let dry = h.success && format!("{}{}", h.raw_stdout, h.raw_stderr).contains("--dry-run");
        let p = Plan {
            id: uuid::Uuid::new_v4().to_string(),
            command: display_command(&args),
            classification,
            request: r,
            args,
            schema,
            dry_run_supported: dry,
            created_at: Utc::now().timestamp(),
        };
        let mut plans = self.plans.lock().unwrap();
        plans.retain(|_, p| Utc::now().timestamp() - p.created_at < 600);
        plans.insert(p.id.clone(), p.clone());
        Ok(p)
    }
    pub async fn run_plan(
        &self,
        id: String,
        confirmed: bool,
        dry_run: bool,
        sink: OutputSink,
    ) -> Result<Execution, String> {
        struct Lease<'a>(&'a Mutex<HashSet<String>>, String);
        impl Drop for Lease<'_> {
            fn drop(&mut self) {
                self.0.lock().unwrap().remove(&self.1);
            }
        }
        if !self.active_plans.lock().unwrap().insert(id.clone()) {
            return Err("This command is already running.".into());
        }
        let _lease = Lease(&self.active_plans, id.clone());
        let p = self
            .plans
            .lock()
            .unwrap()
            .get(&id)
            .cloned()
            .ok_or("Command expired. Prepare it again.")?;
        if Utc::now().timestamp() - p.created_at > 600 {
            return Err("Command review expired. Prepare it again.".into());
        }
        if p.classification != "Read" && !confirmed {
            return Err("Review the command and explicitly confirm the selected account.".into());
        }
        if dry_run && !p.dry_run_supported {
            return Err("This CLI command does not support dry-run.".into());
        }
        if p.classification != "Read" {
            // Fresh account and zone ownership checks are required before EVERY mutation.
            let c = &p.request.context;
            let a = self
                .scoped(
                    vec![
                        "accounts".into(),
                        "get".into(),
                        "--profile".into(),
                        c.profile.clone(),
                    ],
                    c,
                )
                .await;
            let data = a.data.as_ref().map(|v| v.get("result").unwrap_or(v));
            if !a.success || data.and_then(|v| v["id"].as_str()) != Some(c.account_id.as_str()) {
                return Err("Could not verify the selected account. Refresh your login before changing infrastructure.".into());
            }
            if let Some(z) = &c.zone_id {
                let a = self
                    .scoped(
                        vec![
                            "zones".into(),
                            "get".into(),
                            "--zone".into(),
                            z.clone(),
                            "--profile".into(),
                            c.profile.clone(),
                        ],
                        c,
                    )
                    .await;
                let data = a.data.as_ref().map(|v| v.get("result").unwrap_or(v));
                if !a.success
                    || data.and_then(|v| v["account"]["id"].as_str()) != Some(c.account_id.as_str())
                {
                    return Err("Zone does not belong to the selected account.".into());
                }
            }
            if !dry_run
                && p.dry_run_supported
                && !self
                    .dry_runs
                    .lock()
                    .unwrap()
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
            {
                return Err("Run and review the dry-run before executing this change.".into());
            }
        }
        let mut args = p.args.clone();
        if dry_run {
            args.push("--dry-run".into());
        }
        if !dry_run {
            self.plans.lock().unwrap().remove(&id);
            self.dry_runs.lock().unwrap().remove(&id);
        }
        let e = self
            .execute(args, id.clone(), Some(&p.request.context), !dry_run, sink)
            .await;
        if dry_run {
            self.dry_runs.lock().unwrap().insert(id, e.success);
        }
        Ok(e)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::cf::process::ProcessOutput;
    use async_trait::async_trait;
    struct Mock {
        out: &'static str,
        err: &'static str,
        code: i32,
        failure: Option<&'static str>,
    }
    #[async_trait]
    impl Runner for Mock {
        async fn run(
            &self,
            _: &std::path::Path,
            _: &[String],
            _: &std::path::Path,
            _: Option<&super::super::schema::Context>,
            _: Duration,
            _: CancellationToken,
            _: OutputSink,
        ) -> Result<ProcessOutput, String> {
            if let Some(e) = self.failure {
                return Err(e.into());
            }
            Ok(ProcessOutput {
                stdout: self.out.into(),
                stderr: self.err.into(),
                code: self.code,
            })
        }
    }
    // Parser fixtures exercise the same adapter without requiring any executable or account.
    #[test]
    fn fixture_contract() {
        for (s, valid) in [
            (r#"{"result":[]}"#, true),
            ("malformed output", false),
            ("[]", true),
        ] {
            assert_eq!(
                serde_json::from_str::<Value>(&safe_output(s)).is_ok(),
                valid
            );
        }
    }
    #[tokio::test]
    async fn mock_transport() {
        for (out, err, code, failure) in [
            ("{}", "progress", 0, None),
            ("", "401 authentication", 1, None),
            ("", "403 permission", 1, None),
            ("", "unknown command", 1, None),
            ("", "", -1, Some("Command timed out")),
            ("", "", -1, Some("Command cancelled")),
        ] {
            let m = Mock {
                out,
                err,
                code,
                failure,
            };
            let r = m
                .run(
                    std::path::Path::new("cf"),
                    &[],
                    std::path::Path::new("."),
                    None,
                    Duration::from_secs(1),
                    CancellationToken::new(),
                    Arc::new(|_, _| {}),
                )
                .await;
            assert_eq!(r.is_err(), failure.is_some());
            if let Ok(r) = r {
                assert_eq!(r.code, code);
                assert_eq!(r.stderr, err);
            }
        }
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use crate::cf::{process::ProcessOutput, schema::Context};
    use async_trait::async_trait;
    use std::sync::atomic::{AtomicUsize, Ordering};
    struct FixtureRunner(Value);
    #[async_trait]
    impl Runner for FixtureRunner {
        async fn run(
            &self,
            _: &std::path::Path,
            _: &[String],
            _: &std::path::Path,
            _: Option<&super::super::schema::Context>,
            _: Duration,
            _: CancellationToken,
            _: OutputSink,
        ) -> Result<ProcessOutput, String> {
            if let Some(f) = self.0["failure"].as_str() {
                return Err(f.into());
            }
            Ok(ProcessOutput {
                stdout: self.0["stdout"].as_str().unwrap().into(),
                stderr: self.0["stderr"].as_str().unwrap().into(),
                code: self.0["code"].as_i64().unwrap() as i32,
            })
        }
    }
    fn client(runner: Arc<dyn Runner>) -> CfClient {
        let mut c = CfClient::new(
            std::env::temp_dir().join(format!("flareops-test-{}", uuid::Uuid::new_v4())),
        );
        c.binary = Some("mock-cf".into());
        c.runner = runner;
        c
    }
    #[tokio::test]
    async fn execution_fixtures_validate_history_and_redaction() {
        let fixtures: Vec<Value> =
            serde_json::from_str(include_str!("../../tests/fixtures/responses.json")).unwrap();
        for f in fixtures {
            let c = client(Arc::new(FixtureRunner(f.clone())));
            let e = c.simple(vec!["workers".into(), "list".into()], true).await;
            assert_eq!(e.success, f["success"].as_bool().unwrap(), "{}", f["name"]);
            if let Some(message) = f["message"].as_str() {
                assert!(e.error.unwrap_or_default().contains(message));
            }
            assert_eq!(c.history.lock().unwrap().len(), 1);
            let history = std::fs::read_to_string(c.store.dir.join("history.json")).unwrap();
            assert!(!history.contains("do-not-store"));
            assert!(!history.contains("private-value"));
            if f["name"] == "malformed JSON" {
                assert_eq!(e.raw_stdout, "not JSON");
            }
            std::fs::remove_dir_all(&c.store.dir).unwrap();
        }
    }
    struct VersionRunner {
        version: AtomicUsize,
        schema_calls: AtomicUsize,
    }
    #[async_trait]
    impl Runner for VersionRunner {
        async fn run(
            &self,
            _: &std::path::Path,
            args: &[String],
            _: &std::path::Path,
            _: Option<&super::super::schema::Context>,
            _: Duration,
            _: CancellationToken,
            _: OutputSink,
        ) -> Result<ProcessOutput, String> {
            let stdout = if args[0] == "--version" {
                format!("1.0.0-beta.{}", self.version.load(Ordering::SeqCst))
            } else {
                self.schema_calls.fetch_add(1, Ordering::SeqCst);
                r#"{"httpMethod":"GET","pathParams":[],"queryParams":[]}"#.into()
            };
            Ok(ProcessOutput {
                stdout,
                stderr: String::new(),
                code: 0,
            })
        }
    }
    #[tokio::test]
    async fn schema_cache_is_invalidated_when_cli_version_changes() {
        let runner = Arc::new(VersionRunner {
            version: AtomicUsize::new(8),
            schema_calls: AtomicUsize::new(0),
        });
        let c = client(runner.clone());
        for _ in 0..2 {
            c.schema(vec!["workers".into(), "list".into()])
                .await
                .unwrap();
        }
        assert_eq!(runner.schema_calls.load(Ordering::SeqCst), 1);
        runner.version.store(9, Ordering::SeqCst);
        c.schema(vec!["workers".into(), "list".into()])
            .await
            .unwrap();
        assert_eq!(runner.schema_calls.load(Ordering::SeqCst), 2);
        std::fs::remove_dir_all(&c.store.dir).unwrap();
    }
    #[tokio::test]
    async fn mutations_require_confirmation_and_fresh_account_identity() {
        let c = client(Arc::new(FixtureRunner(
            json!({"stdout":"{\"id\":\"wrong-account\"}","stderr":"","code":0}),
        )));
        let p = Plan {
            id: "plan".into(),
            command: "cf d1 create".into(),
            classification: "Create".into(),
            request: Request {
                path: vec!["d1".into(), "create".into()],
                context: Context {
                    profile: "work".into(),
                    account_id: "selected-account".into(),
                    zone_id: None,
                },
                parameters: Default::default(),
                body: None,
            },
            args: vec!["d1".into(), "create".into()],
            schema: json!({}),
            dry_run_supported: true,
            created_at: Utc::now().timestamp(),
        };
        c.plans.lock().unwrap().insert(p.id.clone(), p);
        assert!(c
            .run_plan("plan".into(), false, false, Arc::new(|_, _| {}))
            .await
            .unwrap_err()
            .contains("explicitly confirm"));
        assert!(c
            .run_plan("plan".into(), true, true, Arc::new(|_, _| {}))
            .await
            .unwrap_err()
            .contains("verify the selected account"));
        assert!(c
            .history
            .lock()
            .unwrap()
            .iter()
            .all(|h| !h.command.contains("d1 create")));
        std::fs::remove_dir_all(&c.store.dir).unwrap();
    }
}
