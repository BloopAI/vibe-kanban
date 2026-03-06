use api_types::User;
use sqlx::{PgPool, query_as};
use uuid::Uuid;

use super::identity_errors::IdentityError;

pub struct UserRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> UserRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn fetch_user(&self, user_id: Uuid) -> Result<User, IdentityError> {
        query_as!(
            User,
            r#"
            SELECT
                id           AS "id!: Uuid",
                email        AS "email!",
                first_name   AS "first_name?",
                last_name    AS "last_name?",
                username     AS "username?",
                created_at   AS "created_at!",
                updated_at   AS "updated_at!"
            FROM users
            WHERE id = $1
            "#,
            user_id
        )
        .fetch_optional(self.pool)
        .await?
        .ok_or(IdentityError::NotFound)
    }
}
