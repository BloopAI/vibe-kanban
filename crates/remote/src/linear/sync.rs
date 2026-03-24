use api_types::issue::IssuePriority;

use crate::linear::db::LinearStatusMapping;

/// Map VK IssuePriority to Linear priority integer.
/// Linear: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
pub fn vk_priority_to_linear(p: Option<IssuePriority>) -> i32 {
    match p {
        Some(IssuePriority::Urgent) => 1,
        Some(IssuePriority::High) => 2,
        Some(IssuePriority::Medium) => 3,
        Some(IssuePriority::Low) => 4,
        None => 0,
    }
}

/// Map Linear priority integer to VK IssuePriority.
pub fn linear_priority_to_vk(p: i32) -> Option<IssuePriority> {
    match p {
        1 => Some(IssuePriority::Urgent),
        2 => Some(IssuePriority::High),
        3 => Some(IssuePriority::Medium),
        4 => Some(IssuePriority::Low),
        _ => None,
    }
}

/// Find the VK status ID for a given Linear state ID.
/// Falls back to the provided fallback_status_id if no mapping exists.
pub fn map_linear_state_to_vk(
    linear_state_id: &str,
    mappings: &[LinearStatusMapping],
    fallback_status_id: uuid::Uuid,
) -> uuid::Uuid {
    mappings
        .iter()
        .find(|m| m.linear_state_id == linear_state_id)
        .map(|m| m.vk_status_id)
        .unwrap_or(fallback_status_id)
}

/// Find the Linear state ID for a given VK status ID.
pub fn map_vk_status_to_linear(
    vk_status_id: uuid::Uuid,
    mappings: &[LinearStatusMapping],
) -> Option<&str> {
    mappings
        .iter()
        .find(|m| m.vk_status_id == vk_status_id)
        .map(|m| m.linear_state_id.as_str())
}

/// Auto-generate status mappings by matching VK status names to Linear state names
/// (case-insensitive). Unmatched VK statuses are left unmapped.
pub fn auto_map_statuses<'a>(
    vk_statuses: &'a [(uuid::Uuid, String)],
    linear_states: &'a [crate::linear::client::LinearWorkflowState],
) -> Vec<(uuid::Uuid, &'a str, &'a str)> {
    vk_statuses
        .iter()
        .filter_map(|(vk_id, vk_name)| {
            linear_states
                .iter()
                .find(|s| s.name.eq_ignore_ascii_case(vk_name))
                .map(|s| (*vk_id, s.id.as_str(), s.name.as_str()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_roundtrip() {
        for p in [
            IssuePriority::Urgent,
            IssuePriority::High,
            IssuePriority::Medium,
            IssuePriority::Low,
        ] {
            let linear = vk_priority_to_linear(Some(p));
            let back = linear_priority_to_vk(linear);
            assert_eq!(back, Some(p));
        }
    }

    #[test]
    fn priority_none_maps_to_zero() {
        assert_eq!(vk_priority_to_linear(None), 0);
        assert_eq!(linear_priority_to_vk(0), None);
    }

    #[test]
    fn auto_map_statuses_case_insensitive() {
        use crate::linear::client::LinearWorkflowState;
        let id = uuid::Uuid::new_v4();
        let vk = vec![(id, "In Progress".to_string())];
        let linear = vec![LinearWorkflowState {
            id: "state-1".to_string(),
            name: "in progress".to_string(),
            r#type: "started".to_string(),
            position: 1.0,
        }];
        let result = auto_map_statuses(&vk, &linear);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].1, "state-1");
    }
}
