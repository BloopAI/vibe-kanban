#[derive(Debug)]
pub struct ValidatedWhere {
    pub table: &'static str,
    pub where_clause: &'static str,
}

#[derive(Debug, Clone)]
pub struct ShapeDefinition {
    pub table: &'static str,
    pub where_clause: &'static str,
    pub params: &'static [&'static str],
    pub url: &'static str,
}

impl ShapeDefinition {
    pub const fn new(
        table: &'static str,
        where_clause: &'static str,
        params: &'static [&'static str],
        url: &'static str,
    ) -> Self {
        Self {
            table,
            where_clause,
            params,
            url,
        }
    }
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
