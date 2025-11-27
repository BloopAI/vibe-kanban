use uuid::Uuid;

/// Validated WHERE clause for Electric SQL proxy.
#[derive(Debug)]
pub struct ValidatedWhere {
    pub table: &'static str,
    pub where_clause: &'static str,
}

/// Format a slice of UUIDs for Electric SQL params.
pub fn format_uuid_array(uuids: &[Uuid]) -> String {
    format!(
        "{{{}}}",
        uuids
            .iter()
            .map(|u| u.to_string())
            .collect::<Vec<_>>()
            .join(",")
    )
}

#[macro_export]
macro_rules! validated_where {
    ($table:literal, $where:literal $(, $arg:expr)* $(,)?) => {{
        // Compile-time validation via SQLx using + concatenation
        // This checks: table exists, columns exist, arg types are correct
        let _ = sqlx::query!(
            "SELECT 1 AS v FROM " + $table + " WHERE " + $where
            $(, $arg)*
        );
        $crate::validated_where::ValidatedWhere {
            table: $table,
            where_clause: $where,
        }
    }};
}
