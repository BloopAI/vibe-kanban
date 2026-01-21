use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::{get_txid, types::IssueRelationshipType};
use crate::mutation_types::{DeleteResponse, MutationResponse};

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
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<IssueRelationship>, IssueRelationshipError> {
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
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn list_by_issue(
        pool: &PgPool,
        issue_id: Uuid,
    ) -> Result<Vec<IssueRelationship>, IssueRelationshipError> {
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
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    pub async fn create(
        pool: &PgPool,
        id: Option<Uuid>,
        issue_id: Uuid,
        related_issue_id: Uuid,
        relationship_type: IssueRelationshipType,
    ) -> Result<MutationResponse<IssueRelationship>, IssueRelationshipError> {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let mut tx = pool.begin().await?;
        let data = sqlx::query_as!(
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
        .fetch_one(&mut *tx)
        .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(MutationResponse { data, txid })
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<DeleteResponse, IssueRelationshipError> {
        let mut tx = pool.begin().await?;
        sqlx::query!("DELETE FROM issue_relationships WHERE id = $1", id)
            .execute(&mut *tx)
            .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(DeleteResponse { txid })
    }
}
