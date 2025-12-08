#[derive(Debug)]
pub struct ValidatedWhere {
    pub table: &'static str,
    pub where_clause: &'static str,
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
