use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::types::IssueRelationshipType;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct IssueRelationship {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub related_issue_id: Uuid,
    pub relationship_type: IssueRelationshipType,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum IssueRelationshipError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct IssueRelationshipRepository;

impl IssueRelationshipRepository {
    pub async fn find_by_id<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<IssueRelationship>, IssueRelationshipError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            IssueRelationship,
            r#"
            SELECT
                id                AS "id!: Uuid",
                issue_id          AS "issue_id!: Uuid",
                related_issue_id  AS "related_issue_id!: Uuid",
                relationship_type AS "relationship_type!: IssueRelationshipType",
                created_at        AS "created_at!: DateTime<Utc>"
            FROM issue_relationships
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn list_by_issue<'e, E>(
        executor: E,
        issue_id: Uuid,
    ) -> Result<Vec<IssueRelationship>, IssueRelationshipError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = sqlx::query_as!(
            IssueRelationship,
            r#"
            SELECT
                id                AS "id!: Uuid",
                issue_id          AS "issue_id!: Uuid",
                related_issue_id  AS "related_issue_id!: Uuid",
                relationship_type AS "relationship_type!: IssueRelationshipType",
                created_at        AS "created_at!: DateTime<Utc>"
            FROM issue_relationships
            WHERE issue_id = $1
            "#,
            issue_id
        )
        .fetch_all(executor)
        .await?;

        Ok(records)
    }

    pub async fn create<'e, E>(
        executor: E,
        issue_id: Uuid,
        related_issue_id: Uuid,
        relationship_type: IssueRelationshipType,
    ) -> Result<IssueRelationship, IssueRelationshipError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let record = sqlx::query_as!(
            IssueRelationship,
            r#"
            INSERT INTO issue_relationships (id, issue_id, related_issue_id, relationship_type)
            VALUES ($1, $2, $3, $4)
            RETURNING
                id                AS "id!: Uuid",
                issue_id          AS "issue_id!: Uuid",
                related_issue_id  AS "related_issue_id!: Uuid",
                relationship_type AS "relationship_type!: IssueRelationshipType",
                created_at        AS "created_at!: DateTime<Utc>"
            "#,
            id,
            issue_id,
            related_issue_id,
            relationship_type as IssueRelationshipType
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), IssueRelationshipError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM issue_relationships WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }
}
