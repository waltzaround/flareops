use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Context {
    pub profile: String,
    pub account_id: String,
    pub zone_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub path: Vec<String>,
    pub context: Context,
    #[serde(default)]
    pub parameters: BTreeMap<String, Value>,
    pub body: Option<Value>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub id: String,
    pub command: String,
    pub classification: String,
    pub request: Request,
    pub args: Vec<String>,
    pub schema: Value,
    pub dry_run_supported: bool,
    pub created_at: i64,
}
pub fn valid_path(path: &[String]) -> bool {
    !path.is_empty()
        && path.len() < 12
        && path.iter().all(|s| {
            !s.is_empty()
                && s.bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' || c == b'_')
        })
}
fn query_flag(name: &str) -> String {
    let mut out = String::from("--");
    for c in name.chars() {
        if c.is_ascii_uppercase() { out.push('-'); out.push(c.to_ascii_lowercase()); }
        else if c == '_' || c == '.' { out.push('-'); }
        else { out.push(c); }
    }
    out
}
fn scalar(v: &Value) -> Result<String, String> {
    match v {
        Value::String(s) if !s.starts_with('-') && !s.contains('\0') => Ok(s.clone()),
        Value::Number(_) | Value::Bool(_) => Ok(v.to_string()),
        Value::Array(_) | Value::Object(_) => Ok(v.to_string()),
        _ => Err("Invalid parameter value.".into()),
    }
}
pub fn build_args(r: &Request, schema: &Value) -> Result<(Vec<String>, String), String> {
    if !valid_path(&r.path) {
        return Err("Invalid Cloudflare command path.".into());
    }
    if r.context.profile.is_empty()
        || r.context.profile.starts_with('-')
        || r.context.profile.chars().any(char::is_control)
    {
        return Err("Select an authenticated profile.".into());
    }
    if r.path
        .iter()
        .any(|s| ["tokens", "secrets", "credentials", "certificates"].contains(&s.as_str()))
    {
        return Err(
            "Commands that may expose credentials are not supported in this version.".into(),
        );
    }
    let method = schema["httpMethod"]
        .as_str()
        .ok_or("CLI schema incompatible: HTTP method missing.")?;
    let mut class = match method {
        "GET" => "Read",
        "POST" => "Create",
        "PUT" | "PATCH" => "Modify",
        "DELETE" => "Destructive",
        _ => return Err("Unsupported command method.".into()),
    };
    let log_query = r.path == ["logs", "query"]
        && method == "POST"
        && schema["path"] == "/{account_or_zone}/{account_or_zone_id}/logs/explorer/query/sql";
    let analytics_query = r.path == ["analytics_engine", "sql", "query"]
        && method == "POST"
        && schema["path"] == "/accounts/{account_id}/analytics_engine/sql";
    let trace = r.path == ["request-tracers", "traces", "create"]
        && method == "POST"
        && schema["path"] == "/accounts/{account_id}/request-tracer/trace";
    if log_query || analytics_query {
        let sql = r
            .body
            .as_ref()
            .and_then(Value::as_str)
            .ok_or("Enter a SQL query.")?;
        if !sql.trim_start().to_ascii_uppercase().starts_with("SELECT ") {
            return Err("Analytics queries accept SELECT statements only.".into());
        }
        class = "Read";
    }
    if trace && r.body.as_ref().is_some_and(|b| b["skip_response"] == true) {
        class = "Read";
    }
    if r.context.account_id.is_empty()
        || r.context.account_id.starts_with('-')
        || r.context.account_id.chars().any(char::is_whitespace)
        || r.context
            .zone_id
            .as_ref()
            .is_some_and(|z| z.starts_with('-') || z.chars().any(char::is_whitespace))
    {
        return Err("Select an account before preparing a command.".into());
    }
    if method != "GET"
        && r.path.iter().any(|p| {
            [
                "delete",
                "purge-cache",
                "purge",
                "revoke",
                "destroy",
                "truncate",
                "reset",
            ]
            .contains(&p.as_str())
        })
    {
        class = "Destructive";
    }
    let mut args = r.path.clone();
    let path_params = schema["pathParams"]
        .as_array()
        .ok_or("CLI schema incompatible: path parameters missing.")?;
    for p in path_params {
        let name = p["name"].as_str().ok_or("Invalid path parameter")?;
        match name {
            "account_id" | "account_or_zone" | "account_or_zone_id" => {}
            "zone_id" => {
                if r.context.zone_id.as_deref().unwrap_or("").is_empty() {
                    return Err("Select a zone for this command.".into());
                }
            }
            _ => {
                // API path parameters are not always CLI positional arguments.
                let path_flag = match name {
                    "bucket_name" if r.path.starts_with(&["basin-catalog".into(), "namespaces".into()]) => Some("--bucket-name"),
                    "namespace" if r.path.starts_with(&["basin-catalog".into(), "namespaces".into(), "tables".into()]) => Some("--namespace"),
                    "gateway_id" if r.path == ["ai-gateway", "logs", "list"] || r.path == ["ai-gateway", "custom-domains", "list"] => Some("--gateway-id"),
                    "index_name" if r.path == ["vectorize", "metadata-index", "list"] => Some("--index-name"),
                    "id" if r.path == ["ai-search", "items", "list"] || r.path == ["ai-search", "jobs", "list"] => Some("--id"),
                    "app_id" if r.path == ["realtime", "kit", "meetings", "list"] => Some("--app-id"),

                    "report_id" if r.path == ["abuse-reports", "mitigations", "list"] => Some("--report-id"),
                    "list_id" if r.path == ["rules", "lists", "items", "list"] => Some("--list-id"),
                    "identifier" if r.path == ["stream", "videos", "captions", "list"] => Some("--identifier"),
                    "script_name" if r.path == ["workers", "deployments", "list"] => {
                        Some("--script-name")
                    }
                    "external_script_id" if r.path == ["builds", "list"] => {
                        Some("--external-script-id")
                    }
                    "project_name"
                        if r.path == ["pages", "deployments", "list"]
                            || r.path == ["pages", "deployments", "history", "logs", "get"] =>
                    {
                        Some("--project-name")
                    }
                    _ => None,
                };
                if let Some(flag) = path_flag {
                    args.push(flag.into());
                }
                // AI Search instance commands take the namespace as --name;
                // create and namespace commands still take a positional name.
                if name == "name"
                    && r.path.first().is_some_and(|p| p == "ai-search")
                    && r.path.get(1).is_some_and(|p| {
                        matches!(
                            p.as_str(),
                            "chat-completions"
                                | "delete"
                                | "get"
                                | "items"
                                | "jobs"
                                | "list"
                                | "move"
                                | "purge-cache"
                                | "search"
                                | "stats"
                                | "update"
                        )
                    })
                {
                    args.push("--name".into());
                }
                args.push(scalar(
                    r.parameters
                        .get(name)
                        .ok_or_else(|| format!("Required: {name}"))?,
                )?);
            }
        }
    }
    for (key, value) in &r.parameters {
        if [
            "account_id",
            "account.id",
            "account-id",
            "account_or_zone",
            "account_or_zone_id",
            "zone_id",
            "zone",
            "zone-id",
            "profile",
            "force",
        ]
        .contains(&key.as_str())
        {
            return Err("Context and force flags cannot be overridden.".into());
        }
        if path_params.iter().any(|p| p["name"] == *key) {
            continue;
        }
        let known = schema["queryParams"]
            .as_array()
            .is_some_and(|p| p.iter().any(|p| p["name"] == *key));
        if !known {
            return Err(format!("Unknown schema parameter: {key}"));
        }
        args.push(query_flag(key));
        args.push(scalar(value)?);
    }
    if let Some(body) = &r.body {
        if schema["hasRequestBody"] != true {
            return Err("This command does not accept a body.".into());
        }
        let mut safe = body.clone();
        super::parser::scrub(&mut safe);
        if safe != *body {
            return Err("Secret-bearing payloads are not supported.".into());
        }
        args.push("--body".into());
        args.push(if log_query || analytics_query {
            body.as_str().unwrap().to_string()
        } else {
            body.to_string()
        });
    }
    args.extend(["--profile".into(), r.context.profile.clone()]);
    // account_id path parameters are resolved from the child process environment.
    // Account filters (e.g. zones list) still need an explicit query parameter.
    if schema["queryParams"]
        .as_array()
        .is_some_and(|params| params.iter().any(|p| p["name"] == "account.id"))
    {
        args.extend(["--account-id".into(), r.context.account_id.clone()]);
    }
    if path_params
        .iter()
        .any(|p| p["name"] == "zone_id" || p["name"] == "account_or_zone")
    {
        if let Some(zone) = &r.context.zone_id {
            args.extend(["--zone".into(), zone.clone()]);
        }
    }
    Ok((args, class.into()))
}
pub fn display_command(args: &[String]) -> String {
    format!(
        "cf {}",
        args.iter()
            .map(|s| {
                if s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_./".contains(&b))
                {
                    s.clone()
                } else {
                    format!("'{}'", s.replace('\'', "'\\''"))
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn req() -> Request {
        Request {
            path: vec!["dns".into(), "records".into(), "delete".into()],
            context: Context {
                profile: "work".into(),
                account_id: "abc".into(),
                zone_id: Some("zone".into()),
            },
            parameters: BTreeMap::from([("dns_record_id".into(), json!("record"))]),
            body: None,
        }
    }
    #[test]
    fn camel_case_api_filters_use_cli_kebab_case() {
        assert_eq!(query_flag("botVerificationStatus"), "--bot-verification-status");
        assert_eq!(query_flag("botCategory"), "--bot-category");
        assert_eq!(query_flag("per_page"), "--per-page");
    }
    #[test]
    fn catalog_namespaces_use_named_parent_flags() {
        let r = Request {
            path: vec!["basin-catalog".into(), "namespaces".into(), "tables".into(), "list".into()],
            context: Context { profile: "test".into(), account_id: "account".into(), zone_id: None },
            parameters: BTreeMap::from([("bucket_name".into(), serde_json::json!("warehouse")), ("namespace".into(), serde_json::json!("analytics"))]), body: None,
        };
        let schema = serde_json::json!({"httpMethod":"GET", "pathParams":[{"name":"account_id"},{"name":"bucket_name"},{"name":"namespace"}],"queryParams":[]});
        let (args, class) = build_args(&r, &schema).unwrap();
        assert_eq!(class, "Read");
        assert!(args.windows(2).any(|w| w == ["--bucket-name", "warehouse"]));
        assert!(args.windows(2).any(|w| w == ["--namespace", "analytics"]));
    }
    #[test]
    fn analytics_engine_path_allows_underscores_without_shell_syntax() {
        assert!(valid_path(&[
            "analytics_engine".into(),
            "sql".into(),
            "query".into()
        ]));
        for segment in ["bad;command", "bad command", "$(command)"] {
            assert!(!valid_path(&[segment.into()]));
        }
    }
    #[test]
    fn ai_search_namespace_uses_named_flag() {
        let mut r = req();
        r.path = vec!["ai-search".into(), "list".into()];
        r.parameters = BTreeMap::from([
            ("name".into(), json!("default")),
            ("page".into(), json!(1)),
            ("per_page".into(), json!(20)),
        ]);
        let schema = json!({"httpMethod":"GET", "pathParams":[{"name":"account_id"},{"name":"name"}], "queryParams":[{"name":"page"},{"name":"per_page"}]});
        let (args, class) = build_args(&r, &schema).unwrap();
        assert_eq!(class, "Read");
        assert_eq!(
            args,
            vec![
                "ai-search",
                "list",
                "--name",
                "default",
                "--page",
                "1",
                "--per-page",
                "20",
                "--profile",
                "work"
            ]
        );
        r.parameters.remove("name");
        assert!(build_args(&r, &schema).is_err());
    }
    #[test]
    fn ai_search_get_keeps_instance_positional_and_namespace_named() {
        let mut r = req();
        r.path = vec!["ai-search".into(), "get".into()];
        r.parameters = BTreeMap::from([
            ("name".into(), json!("default")),
            ("id".into(), json!("search-instance")),
        ]);
        let schema = json!({"httpMethod":"GET", "pathParams":[{"name":"account_id"},{"name":"name"},{"name":"id"}]});
        assert_eq!(
            build_args(&r, &schema).unwrap().0,
            vec![
                "ai-search",
                "get",
                "--name",
                "default",
                "search-instance",
                "--profile",
                "work"
            ]
        );
        r.path = vec!["ai-search".into(), "namespace".into(), "get".into()];
        r.parameters.remove("id");
        let schema =
            json!({"httpMethod":"GET", "pathParams":[{"name":"account_id"},{"name":"name"}]});
        assert_eq!(
            build_args(&r, &schema).unwrap().0,
            vec![
                "ai-search",
                "namespace",
                "get",
                "default",
                "--profile",
                "work"
            ]
        );
    }
    #[test]
    fn explicit_context_and_destructive() {
        let(a,c)=build_args(&req(),&json!({"httpMethod":"DELETE","pathParams":[{"name":"dns_record_id"},{"name":"zone_id"}]})).unwrap();
        assert_eq!(c, "Destructive");
        assert!(a.contains(&"--profile".into()));
        assert_eq!(a[3], "record");
        assert!(!a.contains(&"--force".into()));
    }
    #[test]
    fn context_matches_bundled_cli_flags() {
        let (dns, _) = build_args(&req(), &json!({"httpMethod":"DELETE","pathParams":[{"name":"zone_id"},{"name":"dns_record_id"}]})).unwrap();
        assert!(dns.windows(2).any(|p| p == ["--zone", "zone"]));
        assert!(!dns.iter().any(|p| p == "--account-id" || p == "--zone-id"));
        let mut r = req();
        r.parameters.clear();
        r.path = vec!["workers".into(), "list".into()];
        let (worker, _) = build_args(
            &r,
            &json!({"httpMethod":"GET","pathParams":[{"name":"account_id"}]}),
        )
        .unwrap();
        assert_eq!(worker, vec!["workers", "list", "--profile", "work"]);
        r.path = vec!["zones".into(), "list".into()];
        let (zones, _) = build_args(
            &r,
            &json!({"httpMethod":"GET","pathParams":[],"queryParams":[{"name":"account.id"}]}),
        )
        .unwrap();
        assert!(zones.windows(2).any(|p| p == ["--account-id", "abc"]));
        r.parameters
            .insert("account.id".into(), json!("other-account"));
        assert!(build_args(
            &r,
            &json!({"httpMethod":"GET","pathParams":[],"queryParams":[{"name":"account.id"}]})
        )
        .is_err());
    }
    #[test]
    fn investigation_context_and_plain_sql() {
        let mut r = req();
        r.path = vec!["logs".into(), "query".into()];
        r.parameters.clear();
        r.body = Some(json!("SELECT * FROM http_requests LIMIT 10"));
        let schema = json!({"httpMethod":"POST", "path":"/{account_or_zone}/{account_or_zone_id}/logs/explorer/query/sql", "pathParams":[{"name":"account_or_zone"},{"name":"account_or_zone_id"}], "hasRequestBody":true});
        let (args, class) = build_args(&r, &schema).unwrap();
        assert_eq!(class, "Read");
        assert_eq!(&args[..2], &["logs", "query"]);
        assert!(args
            .windows(2)
            .any(|p| p == ["--body", "SELECT * FROM http_requests LIMIT 10"]));
        assert!(args.windows(2).any(|p| p == ["--zone", "zone"]));
        assert!(!args.contains(&"zones".into()));
        r.context.zone_id = None;
        assert!(!build_args(&r, &schema)
            .unwrap()
            .0
            .contains(&"--zone".into()));
        r.body = Some(json!("@/tmp/private-file"));
        assert!(build_args(&r, &schema).is_err());
        r.body = Some(json!("SELECT 1"));
        r.parameters
            .insert("account_or_zone_id".into(), json!("other-account"));
        assert!(build_args(&r, &schema).is_err());
    }
    #[test]
    fn analytics_engine_passes_plain_sql_and_classifies_only_verified_queries_as_read() {
        let mut r = req();
        r.path = vec!["analytics_engine".into(), "sql".into(), "query".into()];
        r.parameters.clear();
        r.body = Some(json!("SELECT * FROM events LIMIT 10 FORMAT JSON"));
        let schema = json!({"httpMethod":"POST", "path":"/accounts/{account_id}/analytics_engine/sql", "pathParams":[{"name":"account_id"}], "hasRequestBody":true});
        let (args, class) = build_args(&r, &schema).unwrap();
        assert_eq!(class, "Read");
        assert!(args.windows(2).any(|p| p == ["--body", "SELECT * FROM events LIMIT 10 FORMAT JSON"]));
        for body in [json!("DELETE FROM events"), json!("@/tmp/query.sql"), json!({"sql":"SELECT 1"})] {
            r.body = Some(body);
            assert!(build_args(&r, &schema).is_err());
        }
        r.body = Some(json!("SELECT 1"));
        let mut unrelated = schema.clone();
        unrelated["path"] = json!("/unrelated");
        assert_eq!(build_args(&r, &unrelated).unwrap().1, "Create");
    }
    #[test]
    fn trace_is_read_only_when_origin_is_skipped() {
        let mut r = req();
        r.path = vec!["request-tracers".into(), "traces".into(), "create".into()];
        r.parameters.clear();
        let schema = json!({"httpMethod":"POST", "path":"/accounts/{account_id}/request-tracer/trace", "pathParams":[{"name":"account_id"}], "hasRequestBody":true});
        r.body = Some(json!({"url":"https://example.com", "method":"GET", "skip_response":true}));
        assert_eq!(build_args(&r, &schema).unwrap().1, "Read");
        r.body = Some(json!({"url":"https://example.com", "method":"POST", "skip_response":false}));
        assert_eq!(build_args(&r, &schema).unwrap().1, "Create");
    }
    #[test]
    fn product_list_resources_use_named_flags() {
        for (path, param, flag) in [
            (vec!["abuse-reports", "mitigations", "list"], "report_id", "--report-id"),
            (vec!["ai-gateway", "logs", "list"], "gateway_id", "--gateway-id"),
            (vec!["ai-gateway", "custom-domains", "list"], "gateway_id", "--gateway-id"),
            (vec!["vectorize", "metadata-index", "list"], "index_name", "--index-name"),
            (vec!["ai-search", "items", "list"], "id", "--id"),
            (vec!["ai-search", "jobs", "list"], "id", "--id"),
            (vec!["realtime", "kit", "meetings", "list"], "app_id", "--app-id"),
            (vec!["rules", "lists", "items", "list"], "list_id", "--list-id"),
            (vec!["stream", "videos", "captions", "list"], "identifier", "--identifier"),
        ] {
            let mut r = req();
            r.path = path.iter().map(|s| s.to_string()).collect();
            r.parameters = BTreeMap::from([(param.into(), json!("resource"))]);
            let schema = json!({"httpMethod":"GET", "pathParams":[{"name":"account_id"},{"name":param}], "queryParams":[]});
            let (args, class) = build_args(&r, &schema).unwrap();
            assert_eq!(class, "Read");
            assert!(args.windows(2).any(|p| p == [flag, "resource"]));
        }
    }
    #[test]
    fn deployment_lists_use_named_resource_flags() {
        for (path, name, value, flag) in [
            (
                vec!["workers", "deployments", "list"],
                "script_name",
                "edge-api",
                "--script-name",
            ),
            (
                vec!["builds", "list"],
                "external_script_id",
                "worker-tag",
                "--external-script-id",
            ),
            (
                vec!["pages", "deployments", "list"],
                "project_name",
                "site",
                "--project-name",
            ),
        ] {
            let mut r = req();
            r.path = path.iter().map(|s| s.to_string()).collect();
            r.parameters = BTreeMap::from([
                (name.into(), json!(value)),
                ("page".into(), json!(2)),
                ("per_page".into(), json!(20)),
            ]);
            let schema = json!({"httpMethod":"GET", "pathParams":[{"name":"account_id"},{"name":name}], "queryParams":[{"name":"page"},{"name":"per_page"}]});
            let (args, class) = build_args(&r, &schema).unwrap();
            let mut expected: Vec<String> = path.iter().map(|s| s.to_string()).collect();
            expected.extend(
                [
                    flag,
                    value,
                    "--page",
                    "2",
                    "--per-page",
                    "20",
                    "--profile",
                    "work",
                ]
                .iter()
                .map(|s| s.to_string()),
            );
            assert_eq!(args, expected);
            assert_eq!(class, "Read");
            r.parameters.insert(name.into(), json!("--help"));
            assert!(build_args(&r, &schema).is_err());
        }
    }
    #[test]
    fn deployment_logs_keep_ids_positional_and_project_named() {
        let mut r = req();
        r.path = ["pages", "deployments", "history", "logs", "get"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        r.parameters = BTreeMap::from([
            ("deployment_id".into(), json!("deploy-id")),
            ("project_name".into(), json!("site")),
        ]);
        let schema = json!({"httpMethod":"GET", "pathParams":[{"name":"deployment_id"},{"name":"project_name"},{"name":"account_id"}]});
        assert_eq!(
            build_args(&r, &schema).unwrap().0,
            vec![
                "pages",
                "deployments",
                "history",
                "logs",
                "get",
                "deploy-id",
                "--project-name",
                "site",
                "--profile",
                "work"
            ]
        );
        r.path = vec!["builds".into(), "logs".into(), "get".into()];
        r.parameters = BTreeMap::from([
            ("build_uuid".into(), json!("build-id")),
            ("cursor".into(), json!("next")),
        ]);
        let schema = json!({"httpMethod":"GET", "pathParams":[{"name":"account_id"},{"name":"build_uuid"}], "queryParams":[{"name":"cursor"}]});
        assert_eq!(
            build_args(&r, &schema).unwrap().0,
            vec![
                "builds",
                "logs",
                "get",
                "build-id",
                "--cursor",
                "next",
                "--profile",
                "work"
            ]
        );
    }
    #[test]
    fn reject_changed_schema_and_context() {
        assert!(build_args(&req(), &json!({"method":"DELETE"})).is_err());
        let mut r = req();
        r.context.account_id.clear();
        assert!(build_args(&r, &json!({"httpMethod":"GET"})).is_err());
    }
    #[test]
    fn reject_injected_flag() {
        let mut r = req();
        r.parameters.insert("dns_record_id".into(), json!("--help"));
        assert!(build_args(
            &r,
            &json!({"httpMethod":"DELETE","pathParams":[{"name":"dns_record_id"}]})
        )
        .is_err());
    }
}
