use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

/// Cache TTL in minutes
const CACHE_TTL_MINUTES: i64 = 5;

/// A cached Jira response entry (internal row representation)
#[derive(Debug, Clone, FromRow)]
struct JiraCacheRow {
    pub cache_key: String,
    pub data: String,
    pub cached_at: String,
}

/// Cached Jira issues response with parsed data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JiraCache<T> {
    pub cache_key: String,
    pub data: T,
    pub cached_at: DateTime<Utc>,
}

impl<T: for<'de> Deserialize<'de>> JiraCache<T> {
    /// Check if the cache entry is still valid (within TTL)
    pub fn is_valid(&self) -> bool {
        let now = Utc::now();
        let expiry = self.cached_at + Duration::minutes(CACHE_TTL_MINUTES);
        now < expiry
    }

    /// Get the remaining TTL in seconds
    pub fn remaining_ttl_secs(&self) -> i64 {
        let expiry = self.cached_at + Duration::minutes(CACHE_TTL_MINUTES);
        let remaining = expiry - Utc::now();
        remaining.num_seconds().max(0)
    }
}

/// Database operations for Jira cache
pub struct JiraCacheRepo;

impl JiraCacheRepo {
    /// Get a cached entry by key if it exists and is valid
    pub async fn get<T: for<'de> Deserialize<'de>>(
        pool: &SqlitePool,
        cache_key: &str,
    ) -> Result<Option<JiraCache<T>>, JiraCacheError> {
        let row: Option<JiraCacheRow> = sqlx::query_as(
            r#"
            SELECT cache_key, data, cached_at
            FROM jira_cache
            WHERE cache_key = $1
            "#,
        )
        .bind(cache_key)
        .fetch_optional(pool)
        .await?;

        match row {
            Some(row) => {
                let data: T = serde_json::from_str(&row.data)?;
                let cached_at = parse_sqlite_datetime(&row.cached_at)?;
                let cache = JiraCache {
                    cache_key: row.cache_key,
                    data,
                    cached_at,
                };

                if cache.is_valid() {
                    Ok(Some(cache))
                } else {
                    // Cache expired, delete it
                    Self::delete(pool, cache_key).await?;
                    Ok(None)
                }
            }
            None => Ok(None),
        }
    }

    /// Store data in the cache (upsert)
    pub async fn set<T: Serialize>(
        pool: &SqlitePool,
        cache_key: &str,
        data: &T,
    ) -> Result<(), JiraCacheError> {
        let data_json = serde_json::to_string(data)?;

        sqlx::query(
            r#"
            INSERT INTO jira_cache (cache_key, data)
            VALUES ($1, $2)
            ON CONFLICT(cache_key) DO UPDATE SET
                data = excluded.data,
                cached_at = datetime('now', 'subsec')
            "#,
        )
        .bind(cache_key)
        .bind(data_json)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Delete a cache entry by key
    pub async fn delete(pool: &SqlitePool, cache_key: &str) -> Result<u64, JiraCacheError> {
        let result = sqlx::query("DELETE FROM jira_cache WHERE cache_key = $1")
            .bind(cache_key)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Delete all expired cache entries
    pub async fn cleanup_expired(pool: &SqlitePool) -> Result<u64, JiraCacheError> {
        let cutoff = Utc::now() - Duration::minutes(CACHE_TTL_MINUTES);
        let cutoff_str = cutoff.format("%Y-%m-%d %H:%M:%S%.f").to_string();

        let result = sqlx::query("DELETE FROM jira_cache WHERE cached_at < $1")
            .bind(cutoff_str)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Invalidate all cache entries (force refresh)
    pub async fn invalidate_all(pool: &SqlitePool) -> Result<u64, JiraCacheError> {
        let result = sqlx::query("DELETE FROM jira_cache")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

/// Parse SQLite datetime string to DateTime<Utc>
fn parse_sqlite_datetime(s: &str) -> Result<DateTime<Utc>, JiraCacheError> {
    // SQLite stores datetime with subsecond precision as "2024-01-17 12:34:56.789"
    // Try multiple formats to be flexible
    let formats = [
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
    ];

    for fmt in formats {
        if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(s, fmt) {
            return Ok(DateTime::from_naive_utc_and_offset(naive, Utc));
        }
    }

    Err(JiraCacheError::ParseError(format!(
        "Failed to parse datetime: {}",
        s
    )))
}

#[derive(Debug, thiserror::Error)]
pub enum JiraCacheError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("JSON serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Parse error: {0}")]
    ParseError(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_validity() {
        let cache = JiraCache {
            cache_key: "test".to_string(),
            data: "test data".to_string(),
            cached_at: Utc::now(),
        };
        assert!(cache.is_valid());
        assert!(cache.remaining_ttl_secs() > 0);
    }

    #[test]
    fn test_cache_expired() {
        let cache = JiraCache {
            cache_key: "test".to_string(),
            data: "test data".to_string(),
            cached_at: Utc::now() - Duration::minutes(10),
        };
        assert!(!cache.is_valid());
        assert_eq!(cache.remaining_ttl_secs(), 0);
    }

    #[test]
    fn test_parse_sqlite_datetime() {
        let result = parse_sqlite_datetime("2024-01-17 12:34:56.789");
        assert!(result.is_ok());

        let result = parse_sqlite_datetime("2024-01-17 12:34:56");
        assert!(result.is_ok());
    }
}
