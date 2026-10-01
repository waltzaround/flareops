use regex::Regex;
use std::sync::LazyLock;
// Beta cf --version includes a human-readable banner; do not display or key caches by that banner.
pub fn parse(output: &str) -> Result<String, String> {
    static VERSION: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b").unwrap());
    VERSION
        .captures(output)
        .map(|c| c[1].to_string())
        .ok_or_else(|| "CLI version output incompatible.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_beta_banner_and_plain_version() {
        assert_eq!(
            parse("🍊☁️ cf · v1.0.0-beta.8\n────").unwrap(),
            "1.0.0-beta.8"
        );
        assert_eq!(parse("1.0.0-beta.9").unwrap(), "1.0.0-beta.9");
        assert!(parse("Cloud Foundry CLI").is_err());
    }
}
