use regex::Regex;
use uuid::Uuid;

pub fn git_branch_id(input: &str) -> String {
    // 1. lowercase
    let lower = input.to_lowercase();

    // 2. replace non-alphanumerics with hyphens
    let re = Regex::new(r"[^a-z0-9]+").unwrap();
    let slug = re.replace_all(&lower, "-");

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

/// Keep only the last `limit_bytes` bytes of a string, respecting UTF-8 char
/// boundaries. If the input is shorter than `limit_bytes`, returns it unchanged.
/// Otherwise scans forward from the cut point to the nearest char boundary and
/// prefixes the result with "…".
///
/// The maximum returned length is `limit_bytes + 3 (ellipsis) + 3 (boundary skip)`
/// = `limit_bytes + 6` in the worst case (a 4-byte codepoint straddling the cut).
pub fn truncate_left_to_char_boundary(s: &str, limit_bytes: usize) -> String {
    if s.len() <= limit_bytes {
        return s.to_string();
    }
    let start = s.len() - limit_bytes;
    let mut boundary = start;
    while !s.is_char_boundary(boundary) && boundary < s.len() {
        boundary += 1;
    }
    format!("…{}", &s[boundary..])
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

    #[test]
    fn test_truncate_to_char_boundary() {
        use super::truncate_to_char_boundary;

        let input = "a".repeat(10);
        assert_eq!(truncate_to_char_boundary(&input, 7), "a".repeat(7));

        let input = "hello world";
        assert_eq!(truncate_to_char_boundary(input, input.len()), input);

        let input = "🔥🔥🔥"; // each fire emoji is 4 bytes
        assert_eq!(truncate_to_char_boundary(input, 5), "🔥");
        assert_eq!(truncate_to_char_boundary(input, 3), "");
    }

    #[test]
    fn truncate_left_passes_through_short_input() {
        use super::truncate_left_to_char_boundary;
        assert_eq!(truncate_left_to_char_boundary("hello", 100), "hello");
    }

    #[test]
    fn truncate_left_cuts_long_input_with_ellipsis() {
        use super::truncate_left_to_char_boundary;
        let big = "x".repeat(5000);
        let out = truncate_left_to_char_boundary(&big, 2048);
        assert!(out.starts_with('…'));
        // ellipsis (3 bytes) + up to (limit + 3 boundary skip) content bytes
        assert!(out.len() <= 2048 + 3 + 3);
    }

    #[test]
    fn truncate_left_respects_utf8_boundary() {
        use super::truncate_left_to_char_boundary;
        // 3000 ASCII bytes followed by "日本語" (9 bytes, 3-byte codepoints)
        let s = format!("{}{}", "a".repeat(3000), "日本語");
        let out = truncate_left_to_char_boundary(&s, 2048);
        assert!(out.is_char_boundary(0));
        assert!(out.is_char_boundary(out.len()));
    }
}
