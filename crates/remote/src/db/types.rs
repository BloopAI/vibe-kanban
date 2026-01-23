use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[sqlx(type_name = "issue_priority", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum IssuePriority {
    Urgent,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[sqlx(type_name = "issue_relationship_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum IssueRelationshipType {
    Blocking,
    Related,
    HasDuplicate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[sqlx(type_name = "pull_request_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum PullRequestStatus {
    Open,
    Merged,
    Closed,
}

/// Validates that a string is in HSL format: "H S% L%"
/// where H is 0-360, S is 0-100%, L is 0-100%
pub fn is_valid_hsl_color(color: &str) -> bool {
    let parts: Vec<&str> = color.split(' ').collect();
    if parts.len() != 3 {
        return false;
    }

    // Parse hue (0-360)
    let Some(h) = parts[0].parse::<u16>().ok() else {
        return false;
    };
    if h > 360 {
        return false;
    }

    // Parse saturation (0-100%)
    let Some(s_str) = parts[1].strip_suffix('%') else {
        return false;
    };
    let Some(s) = s_str.parse::<u8>().ok() else {
        return false;
    };
    if s > 100 {
        return false;
    }

    // Parse lightness (0-100%)
    let Some(l_str) = parts[2].strip_suffix('%') else {
        return false;
    };
    let Some(l) = l_str.parse::<u8>().ok() else {
        return false;
    };
    if l > 100 {
        return false;
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_hsl_colors() {
        assert!(is_valid_hsl_color("0 0% 0%"));
        assert!(is_valid_hsl_color("360 100% 100%"));
        assert!(is_valid_hsl_color("217 91% 60%"));
        assert!(is_valid_hsl_color("355 65% 53%"));
        assert!(is_valid_hsl_color("220 9% 46%"));
    }

    #[test]
    fn test_invalid_hsl_colors() {
        assert!(!is_valid_hsl_color("#ff0000")); // HEX format
        assert!(!is_valid_hsl_color("361 50% 50%")); // Hue out of range
        assert!(!is_valid_hsl_color("180 101% 50%")); // Saturation out of range
        assert!(!is_valid_hsl_color("180 50% 101%")); // Lightness out of range
        assert!(!is_valid_hsl_color("180 50 50%")); // Missing % on saturation
        assert!(!is_valid_hsl_color("180 50% 50")); // Missing % on lightness
        assert!(!is_valid_hsl_color("hsl(180, 50%, 50%)")); // Wrong format
        assert!(!is_valid_hsl_color("180, 50%, 50%")); // Wrong separator
        assert!(!is_valid_hsl_color("")); // Empty
    }
}
