use once_cell::sync::Lazy;
use regex::Regex;
use uuid::Uuid;

// compile regex once at first use, not on every call
static BRANCH_SANITIZER: Lazy<Regex> = Lazy::new(|| Regex::new(r"[^a-z0-9]+").unwrap());

pub fn git_branch_id(input: &str) -> String {
    // 1. lowercase
    let lower = input.to_lowercase();

    // 2. replace non-alphanumerics with hyphens
    let slug = BRANCH_SANITIZER.replace_all(&lower, "-");

    // 3. trim extra hyphens
    let trimmed = slug.trim_matches('-');

    // 4. take up to 16 chars, then trim trailing hyphens again
    let cut: String = trimmed.chars().take(16).collect();
    cut.trim_end_matches('-').to_string()
}

pub fn short_uuid(u: &Uuid) -> String {
    // to_simple() gives you a 32-char hex string with no hyphens
    let full = u.simple().to_string();
    full.chars().take(4).collect() // grab the first 4 chars
}

pub fn truncate_to_char_boundary(content: &str, max_len: usize) -> &str {
    if content.len() <= max_len {
        return content;
    }

    let cutoff = content
        .char_indices()
        .map(|(idx, _)| idx)
        .chain(std::iter::once(content.len()))
        .take_while(|&idx| idx <= max_len)
        .last()
        .unwrap_or(0);

    debug_assert!(content.is_char_boundary(cutoff));
    &content[..cutoff]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_branch_id_basic() {
        assert_eq!(git_branch_id("My Feature"), "my-feature");
        assert_eq!(git_branch_id("fix auth bug"), "fix-auth-bug");
        assert_eq!(git_branch_id("update-readme"), "update-readme");
    }

    #[test]
    fn test_git_branch_id_special_chars() {
        // security: test injection attempts
        assert_eq!(git_branch_id("../etc/passwd"), "etc-passwd");
        assert_eq!(git_branch_id("rm -rf /"), "rm-rf");
        assert_eq!(git_branch_id("foo;bar|baz&qux"), "foo-bar-baz-qux");

        // git-unsafe characters
        assert_eq!(git_branch_id("foo~bar^baz"), "foo-bar-baz");
        assert_eq!(git_branch_id("foo:bar?baz*qux"), "foo-bar-baz-qux");
        assert_eq!(git_branch_id("foo[bar]baz"), "foo-bar-baz");
    }

    #[test]
    fn test_git_branch_id_empty_results() {
        // symbols only should result in empty string
        assert_eq!(git_branch_id("!!!"), "");
        assert_eq!(git_branch_id("@@@"), "");
        assert_eq!(git_branch_id("---"), "");
        assert_eq!(git_branch_id("   "), "");
    }

    #[test]
    fn test_git_branch_id_length_limit() {
        // exactly 16 chars
        assert_eq!(git_branch_id("1234567890123456"), "1234567890123456");

        // over 16 chars gets truncated
        assert_eq!(git_branch_id("12345678901234567890"), "1234567890123456");

        // trailing hyphens removed after truncation
        assert_eq!(git_branch_id("this-is-a-very-long-branch-name"), "this-is-a-very-l");
    }

    #[test]
    fn test_git_branch_id_unicode() {
        assert_eq!(git_branch_id("añadir función"), "a-adir-funci-n");
        assert_eq!(git_branch_id("修正バグ"), "");
        assert_eq!(git_branch_id("fix🐛bug"), "fix-bug");
    }

    #[test]
    fn test_git_branch_id_leading_trailing() {
        assert_eq!(git_branch_id("---foo---"), "foo");
        assert_eq!(git_branch_id("!!!bar!!!"), "bar");
        assert_eq!(git_branch_id("   spaces   "), "spaces");
    }

    #[test]
    fn test_truncate_to_char_boundary() {
        let input = "a".repeat(10);
        assert_eq!(truncate_to_char_boundary(&input, 7), "a".repeat(7));

        let input = "hello world";
        assert_eq!(truncate_to_char_boundary(input, input.len()), input);

        let input = "🔥🔥🔥"; // each fire emoji is 4 bytes
        assert_eq!(truncate_to_char_boundary(input, 5), "🔥");
        assert_eq!(truncate_to_char_boundary(input, 3), "");
    }
}
