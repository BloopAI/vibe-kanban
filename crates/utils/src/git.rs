pub fn is_valid_branch_prefix(prefix: &str) -> bool {
    if prefix.is_empty() {
        return true;
    }

    if prefix.starts_with('/') || prefix.ends_with('/') {
        return false;
    }

    if prefix.ends_with('.') || prefix.ends_with(".lock") {
        return false;
    }

    if prefix == "@" || prefix.contains("@{") || prefix.contains("..") {
        return false;
    }

    let invalid_chars = [' ', '~', '^', ':', '?', '*', '[', '\\', '\u{0000}'];
    if prefix
        .chars()
        .any(|c| c.is_control() || invalid_chars.contains(&c))
    {
        return false;
    }

    if prefix.contains('/') {
        return false;
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_prefixes() {
        assert!(is_valid_branch_prefix(""));
        assert!(is_valid_branch_prefix("vk"));
        assert!(is_valid_branch_prefix("feature"));
        assert!(is_valid_branch_prefix("hotfix-123"));
        assert!(is_valid_branch_prefix("foo.bar"));
        assert!(is_valid_branch_prefix("foo_bar"));
        assert!(is_valid_branch_prefix("FOO-Bar"));
    }

    #[test]
    fn test_invalid_prefixes() {
        assert!(!is_valid_branch_prefix("foo/bar"));
        assert!(!is_valid_branch_prefix("foo..bar"));
        assert!(!is_valid_branch_prefix("foo@{"));
        assert!(!is_valid_branch_prefix("@"));
        assert!(!is_valid_branch_prefix("foo.lock"));
        assert!(!is_valid_branch_prefix("foo."));
        assert!(!is_valid_branch_prefix("foo bar"));
        assert!(!is_valid_branch_prefix("foo?"));
        assert!(!is_valid_branch_prefix("foo*"));
        assert!(!is_valid_branch_prefix("foo~"));
        assert!(!is_valid_branch_prefix("foo^"));
        assert!(!is_valid_branch_prefix("foo:"));
        assert!(!is_valid_branch_prefix("foo["));
        assert!(!is_valid_branch_prefix("/foo"));
        assert!(!is_valid_branch_prefix("foo/"));
    }
}
