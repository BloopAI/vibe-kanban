use uuid::Uuid;

/// Trait for converting Rust types to SQL literals.
/// Used by the `validated_where!` macro to fill in placeholder values.
pub trait ToSqlLiteral {
    fn to_sql_literal(&self) -> String;
}

impl ToSqlLiteral for &[Uuid] {
    fn to_sql_literal(&self) -> String {
        format!(
            "ARRAY[{}]::uuid[]",
            self.iter()
                .map(|u| format!("'{}'", u))
                .collect::<Vec<_>>()
                .join(",")
        )
    }
}

impl ToSqlLiteral for Vec<Uuid> {
    fn to_sql_literal(&self) -> String {
        self.as_slice().to_sql_literal()
    }
}

impl ToSqlLiteral for &Vec<Uuid> {
    fn to_sql_literal(&self) -> String {
        self.as_slice().to_sql_literal()
    }
}

impl ToSqlLiteral for Uuid {
    fn to_sql_literal(&self) -> String {
        format!("'{}'", self)
    }
}

impl ToSqlLiteral for &Uuid {
    fn to_sql_literal(&self) -> String {
        format!("'{}'", self)
    }
}

/// Result of the `validated_where!` macro containing both table name and WHERE clause.
pub struct ValidatedWhere {
    pub table: &'static str,
    pub where_clause: String,
}

/// Macro that validates a WHERE clause against the database schema at compile time
/// and produces a raw SQL string with values filled in at runtime.
///
/// This combines SQLx's compile-time query validation with runtime value substitution,
/// which is required for Electric SQL's `where` parameter.
///
/// # Arguments
/// * `$table` - Table name as a string literal
/// * `$where` - WHERE clause with placeholders ($1, $2, etc.)
/// * `$arg` - Arguments to substitute (type-checked by SQLx at compile time)
///
/// # Example
/// ```rust,ignore
/// let org_uuids: Vec<Uuid> = vec![uuid1, uuid2];
/// let q = validated_where!(
///     "shared_tasks",
///     r#""organization_id" = ANY($1)"#,
///     &org_uuids
/// );
/// // q.table = "shared_tasks"
/// // q.where_clause = "\"organization_id\" = ANY(ARRAY['uuid1','uuid2']::uuid[])"
/// ```
#[macro_export]
macro_rules! validated_where {
    ($table:literal, $where:literal $(, $arg:expr)* $(,)?) => {{
        // Compile-time validation via SQLx using + concatenation
        // This checks: table exists, columns exist, arg types are correct
        let _ = sqlx::query!(
            "SELECT 1 AS v FROM " + $table + " WHERE " + $where
            $(, $arg)*
        );

        // Runtime: fill in placeholders with actual values
        let values: Vec<String> = vec![
            $( $crate::validated_where::ToSqlLiteral::to_sql_literal(&$arg) ),*
        ];
        let mut result = String::from($where);
        for (i, value) in values.iter().enumerate() {
            result = result.replace(&format!("${}", i + 1), value);
        }

        $crate::validated_where::ValidatedWhere {
            table: $table,
            where_clause: result,
        }
    }};
}
