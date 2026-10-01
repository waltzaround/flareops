use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;
static SECRET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)((?:bearer\s+)|(?:[\"']?(?:api[_-]?token|access[_-]?token|refresh[_-]?token|authorization|password|secret)[\"']?\s*[:=]\s*[\"']?))[^\s\"',}\]]+"#).unwrap()
});
pub fn redact(s: &str) -> String {
    static BEARER: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"(?i)bearer\s+[^\s",]+"#).unwrap());
    let first = BEARER.replace_all(s, "Bearer [REDACTED]");
    SECRET.replace_all(&first, "${1}[REDACTED]").into_owned()
}
pub fn scrub(v: &mut Value) {
    match v {
        Value::Object(o) => {
            for (k, v) in o.iter_mut() {
                if ["token", "secret", "password", "authorization", "credential"]
                    .iter()
                    .any(|s| k.to_lowercase().contains(s))
                {
                    *v = Value::String("[REDACTED]".into());
                } else {
                    scrub(v);
                }
            }
        }
        Value::Array(a) => a.iter_mut().for_each(scrub),
        Value::String(s) => *s = redact(s),
        _ => {}
    }
}
pub fn safe_output(s: &str) -> String {
    if let Ok(mut v) = serde_json::from_str::<Value>(s) {
        scrub(&mut v);
        serde_json::to_string_pretty(&v).unwrap_or_default()
    } else {
        redact(s)
    }
}
pub fn error_message(stderr: &str) -> String {
    let s = stderr.to_lowercase();
    if s.contains("authentication") || s.contains("not logged") || s.contains("401") {
        "Not authenticated. Open Settings → Accounts and sign in again."
    } else if s.contains("403") || s.contains("permission") {
        "Permission denied. Check that this profile can access the selected account."
    } else if s.contains("unknown") || s.contains("unrecognized") {
        "CLI command unavailable. Refresh its schema or update cf."
    } else if s.contains("404") || s.contains("not found") {
        "Resource not found. Refresh the selected account and zone."
    } else if s.contains("network") || s.contains("fetch failed") || s.contains("enotfound") {
        "Network unavailable. Check your connection and retry."
    } else {
        "Cloudflare could not complete this command. Expand technical details for the CLI response."
    }
    .into()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn secrets_are_redacted() {
        let s = safe_output(r#"{"access_token":"abc","nested":{"apiKey":"ok","secret":"xyz"}}"#);
        assert!(!s.contains("abc"));
        assert!(!s.contains("xyz"));
        assert!(!redact("Authorization: Bearer abc123").contains("abc123"));
    }
    #[test]
    fn maps_errors() {
        assert!(error_message("401 authentication failed").starts_with("Not authenticated"));
        assert!(error_message("403 permission denied").starts_with("Permission"));
        assert!(error_message("unknown command").starts_with("CLI command"));
    }
}
