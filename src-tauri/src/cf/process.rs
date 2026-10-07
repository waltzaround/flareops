use super::parser::safe_output;
use async_trait::async_trait;
use std::{path::PathBuf, process::Stdio, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
};
use tokio_util::sync::CancellationToken;
pub type OutputSink = Arc<dyn Fn(&str, String) + Send + Sync>;
pub struct ProcessOutput {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}
#[async_trait]
pub trait Runner: Send + Sync {
    async fn run(
        &self,
        binary: &std::path::Path,
        args: &[String],
        cwd: &std::path::Path,
        context: Option<&super::schema::Context>,
        timeout: Duration,
        cancel: CancellationToken,
        sink: OutputSink,
    ) -> Result<ProcessOutput, String>;
}
pub struct SystemRunner;
async fn drain<R: tokio::io::AsyncRead + Unpin>(
    pipe: R,
    stream: &'static str,
    sink: OutputSink,
) -> String {
    let mut lines = BufReader::new(pipe).lines();
    let mut output = String::new();
    while let Ok(Some(line)) = lines.next_line().await {
        if output.len() + line.len() > 2_000_000 {
            continue;
        }
        let clean = safe_output(&line);
        sink(stream, clean.clone());
        output.push_str(&clean);
        output.push('\n');
    }
    output
}
#[async_trait]
impl Runner for SystemRunner {
    async fn run(
        &self,
        binary: &std::path::Path,
        args: &[String],
        cwd: &std::path::Path,
        context: Option<&super::schema::Context>,
        timeout: Duration,
        cancel: CancellationToken,
        sink: OutputSink,
    ) -> Result<ProcessOutput, String> {
        let mut cmd = Command::new(binary);
        cmd.args(args)
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        // Named profiles must not be shadowed by shell credentials or project config.
        for (key, _) in std::env::vars() {
            if key.starts_with("CLOUDFLARE_")
                || key.starts_with("CF_")
                || key.starts_with("WRANGLER_")
                || key == "NODE_OPTIONS"
                || key == "NODE_PATH"
            {
                cmd.env_remove(key);
            }
        }
        // Set context on this child only, after removing inherited Cloudflare state.
        if let Some(c) = context {
            if !c.account_id.is_empty() {
                cmd.env("CLOUDFLARE_ACCOUNT_ID", &c.account_id);
            }
        }
        cmd.env("NO_COLOR", "1")
            .env("CI", "1")
            .env("WRANGLER_SEND_METRICS", "false");
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Could not start cf: {e}"))?;
        let out = tokio::spawn(drain(child.stdout.take().unwrap(), "stdout", sink.clone()));
        let err = tokio::spawn(drain(child.stderr.take().unwrap(), "stderr", sink));
        let status = tokio::select! {
        s=child.wait()=>s.map_err(|e|e.to_string()).map(|s|s.code().unwrap_or(-1)),
        _=cancel.cancelled()=>{let _=child.kill().await;Err("Command cancelled.".into())},
        _=tokio::time::sleep(timeout)=>{let _=child.kill().await;Err("Command timed out. Check the network and try again.".into())}
        };
        if status.is_err() {
            out.abort();
            err.abort();
            return Err(status.unwrap_err());
        }
        let (stdout, stderr) = tokio::time::timeout(Duration::from_secs(3), async {
            (out.await.unwrap_or_default(), err.await.unwrap_or_default())
        })
        .await
        .map_err(|_| "CLI output stream did not close.".to_string())?;
        Ok(ProcessOutput {
            stdout: safe_output(&stdout),
            stderr: safe_output(&stderr),
            code: status?,
        })
    }
}
pub fn find_binary(name: &str) -> Option<PathBuf> {
    if let Ok(path) = which::which(name) {
        return Some(path);
    }
    let home = std::env::var("HOME").unwrap_or_default();
    [
        format!("/opt/homebrew/bin/{name}"),
        format!("/usr/local/bin/{name}"),
        format!("{home}/.local/bin/{name}"),
        format!("{home}/.volta/bin/{name}"),
    ]
    .into_iter()
    .map(PathBuf::from)
    .find(|p| p.is_file())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[tokio::test]
    async fn system_runner_streams_and_keeps_stderr_separate() {
        let events = Arc::new(std::sync::Mutex::new(Vec::new()));
        let capture = events.clone();
        let out = SystemRunner
            .run(
                std::path::Path::new("/bin/sh"),
                &[
                    "-c".into(),
                    "printf '{\"result\":[]}\\n'; printf 'progress\\n' >&2".into(),
                ],
                std::path::Path::new("/tmp"),
                None,
                Duration::from_secs(2),
                CancellationToken::new(),
                Arc::new(move |stream, line| {
                    capture.lock().unwrap().push((stream.to_string(), line))
                }),
            )
            .await
            .unwrap();
        assert_eq!(out.code, 0);
        assert!(out.stdout.contains("result"));
        assert!(out.stderr.contains("progress"));
        assert_eq!(events.lock().unwrap().len(), 2);
    }
    #[tokio::test]
    async fn concurrent_children_keep_separate_account_context() {
        async fn run(account: &str) -> String {
            let context = super::super::schema::Context {
                profile: "test".into(),
                account_id: account.into(),
                zone_id: None,
            };
            SystemRunner
                .run(
                    std::path::Path::new("/bin/sh"),
                    &["-c".into(), "printf '%s' \"$CLOUDFLARE_ACCOUNT_ID\"".into()],
                    std::path::Path::new("/tmp"),
                    Some(&context),
                    Duration::from_secs(2),
                    CancellationToken::new(),
                    Arc::new(|_, _| {}),
                )
                .await
                .unwrap()
                .stdout
                .trim()
                .to_string()
        }
        let (first, second) = tokio::join!(run("account-a"), run("account-b"));
        assert_eq!(first, "account-a");
        assert_eq!(second, "account-b");
    }
    #[tokio::test]
    async fn system_runner_obeys_timeout_and_cancellation() {
        let token = CancellationToken::new();
        token.cancel();
        let result = SystemRunner
            .run(
                std::path::Path::new("/bin/sh"),
                &["-c".into(), "exec sleep 5".into()],
                std::path::Path::new("/tmp"),
                None,
                Duration::from_secs(3),
                token,
                Arc::new(|_, _| {}),
            )
            .await;
        assert!(result.err().unwrap().contains("cancelled"));
        let result = SystemRunner
            .run(
                std::path::Path::new("/bin/sh"),
                &["-c".into(), "exec sleep 5".into()],
                std::path::Path::new("/tmp"),
                None,
                Duration::from_millis(30),
                CancellationToken::new(),
                Arc::new(|_, _| {}),
            )
            .await;
        assert!(result.err().unwrap().contains("timed out"));
    }
}
