use std::marker::PhantomData;
use ts_rs::TS;

#[derive(Debug)]
pub struct ValidatedWhere {
    pub table: &'static str,
    pub where_clause: &'static str,
}

#[derive(Debug)]
pub struct ShapeDefinition<T: TS> {
    pub table: &'static str,
    pub where_clause: &'static str,
    pub params: &'static [&'static str],
    pub url: &'static str,
    _phantom: PhantomData<T>,
}

impl<T: TS> ShapeDefinition<T> {
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
            _phantom: PhantomData,
        }
    }
}

/// Trait to allow heterogeneous collection of shapes for export
pub trait ShapeExport: Sync {
    fn table(&self) -> &'static str;
    fn params(&self) -> &'static [&'static str];
    fn url(&self) -> &'static str;
    fn ts_type_name(&self) -> String;
}

impl<T: TS + Sync> ShapeExport for ShapeDefinition<T> {
    fn table(&self) -> &'static str {
        self.table
    }
    fn params(&self) -> &'static [&'static str] {
        self.params
    }
    fn url(&self) -> &'static str {
        self.url
    }
    fn ts_type_name(&self) -> String {
        T::name()
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
