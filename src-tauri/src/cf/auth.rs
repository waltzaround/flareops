/// Auth commands always name the credential profile explicitly. Browser OAuth
/// avoids requiring a device code to be copied out of buffered process output.
pub fn args(action: &str, name: Option<&str>, confirmed: bool) -> Result<Vec<String>, String> {
    if !["login", "create", "delete", "whoami"].contains(&action) {
        return Err("Unsupported profile action".into());
    }
    if action == "delete" && !confirmed {
        return Err("Confirm profile removal first.".into());
    }
    if let Some(n) = name {
        if n.is_empty()
            || n.len() > 64
            || !n
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
            || n.starts_with('-')
        {
            return Err("Use 1–64 letters, numbers, hyphens, or underscores for profile names; start with a letter, number, or underscore.".into());
        }
    }
    if action != "login" && name.is_none() {
        return Err("Choose a named login profile first.".into());
    }
    if action == "login" && name.is_some() {
        return Err("Use create to authenticate a named profile.".into());
    }
    let mut args = vec!["auth".into(), action.into()];
    if action == "whoami" {
        args.push("--profile".into());
    }
    if let Some(n) = name {
        args.push(n.into());
    }
    if action == "login" || action == "create" {
        args.extend(["--browser".into(), "--no-device".into()]);
    }
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn named_sign_in_and_reconnect_never_use_the_default_login() {
        assert_eq!(
            args("create", Some("client-acme"), false).unwrap(),
            vec!["auth", "create", "client-acme", "--browser", "--no-device"]
        );
        assert_eq!(
            args("whoami", Some("work"), false).unwrap(),
            vec!["auth", "whoami", "--profile", "work"]
        );
        assert!(args("login", Some("work"), false).is_err());
        assert!(args("create", None, false).is_err());
    }
    #[test]
    fn refuses_unconfirmed_removal_and_option_injection() {
        assert!(args("delete", Some("work"), false).is_err());
        assert!(args("delete", Some("work"), true).is_ok());
        for name in ["", "--help", "../work", "work personal"] {
            assert!(args("create", Some(name), false).is_err());
        }
        assert!(args("activate", Some("work"), true).is_err());
    }
}
