use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// Supported document file types
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DocumentFileType {
    Markdown,
    Pdf,
    Txt,
    Csv,
    Xlsx,
}

impl Default for DocumentFileType {
    fn default() -> Self {
        Self::Markdown
    }
}

impl std::fmt::Display for DocumentFileType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Markdown => write!(f, "markdown"),
            Self::Pdf => write!(f, "pdf"),
            Self::Txt => write!(f, "txt"),
            Self::Csv => write!(f, "csv"),
            Self::Xlsx => write!(f, "xlsx"),
        }
    }
}

impl From<String> for DocumentFileType {
    fn from(s: String) -> Self {
        match s.to_lowercase().as_str() {
            "markdown" | "md" => Self::Markdown,
            "pdf" => Self::Pdf,
            "txt" | "text" => Self::Txt,
            "csv" => Self::Csv,
            "xlsx" | "excel" => Self::Xlsx,
            _ => Self::Markdown,
        }
    }
}

/// Document folder for hierarchical organization
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct DocumentFolder {
    pub id: Uuid,
    pub team_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    /// Optional local filesystem path for syncing documents
    pub local_path: Option<String>,
    pub position: i32,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Document model
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Document {
    pub id: Uuid,
    pub team_id: Uuid,
    pub folder_id: Option<Uuid>,
    pub title: String,
    pub slug: Option<String>,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub file_type: String,
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    pub icon: Option<String>,
    pub is_pinned: bool,
    pub is_archived: bool,
    pub position: i32,
    pub created_by: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Generate a URL-friendly slug from a title
pub fn generate_slug(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c
            } else if c == ' ' || c == '_' || c == '/' {
                '-'
            } else {
                ' ' // Will be filtered out
            }
        })
        .filter(|c| *c != ' ')
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(100) // Max 100 chars
        .collect()
}

/// Request to create a new folder
#[derive(Debug, Deserialize, TS)]
pub struct CreateDocumentFolder {
    #[serde(default)]
    pub team_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    /// Optional local filesystem path for syncing documents
    pub local_path: Option<String>,
}

/// Request to update a folder
#[derive(Debug, Deserialize, TS)]
pub struct UpdateDocumentFolder {
    pub parent_id: Option<Uuid>,
    pub name: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    /// Optional local filesystem path for syncing documents
    pub local_path: Option<String>,
    pub position: Option<i32>,
}

/// Request to create a new document
#[derive(Debug, Deserialize, TS)]
pub struct CreateDocument {
    #[serde(default)]
    pub team_id: Uuid,
    pub folder_id: Option<Uuid>,
    pub title: String,
    pub content: Option<String>,
    pub file_type: Option<String>,
    pub icon: Option<String>,
}

/// Request to update a document
#[derive(Debug, Deserialize, TS)]
pub struct UpdateDocument {
    pub folder_id: Option<Uuid>,
    pub title: Option<String>,
    pub content: Option<String>,
    pub icon: Option<String>,
    pub is_pinned: Option<bool>,
    pub is_archived: Option<bool>,
    pub position: Option<i32>,
}

impl DocumentFolder {
    pub async fn find_all_by_team(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            DocumentFolder,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      parent_id as "parent_id: Uuid",
                      name,
                      icon,
                      color,
                      local_path,
                      position as "position!: i32",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM document_folders
               WHERE team_id = $1
               ORDER BY position ASC, name ASC"#,
            team_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            DocumentFolder,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      parent_id as "parent_id: Uuid",
                      name,
                      icon,
                      color,
                      local_path,
                      position as "position!: i32",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM document_folders
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_children(
        pool: &PgPool,
        parent_id: Option<Uuid>,
        team_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        if let Some(pid) = parent_id {
            sqlx::query_as!(
                DocumentFolder,
                r#"SELECT id as "id!: Uuid",
                          team_id as "team_id!: Uuid",
                          parent_id as "parent_id: Uuid",
                          name,
                          icon,
                          color,
                          local_path,
                          position as "position!: i32",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM document_folders
                   WHERE parent_id = $1 AND team_id = $2
                   ORDER BY position ASC, name ASC"#,
                pid,
                team_id
            )
            .fetch_all(pool)
            .await
        } else {
            sqlx::query_as!(
                DocumentFolder,
                r#"SELECT id as "id!: Uuid",
                          team_id as "team_id!: Uuid",
                          parent_id as "parent_id: Uuid",
                          name,
                          icon,
                          color,
                          local_path,
                          position as "position!: i32",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM document_folders
                   WHERE parent_id IS NULL AND team_id = $1
                   ORDER BY position ASC, name ASC"#,
                team_id
            )
            .fetch_all(pool)
            .await
        }
    }

    pub async fn create(pool: &PgPool, data: &CreateDocumentFolder) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        // Get max position for ordering
        let max_position: i32 = if let Some(parent_id) = data.parent_id {
            sqlx::query_scalar!(
                r#"SELECT COALESCE(MAX(position), -1) + 1 as "pos!: i32"
                   FROM document_folders
                   WHERE parent_id = $1 AND team_id = $2"#,
                parent_id,
                data.team_id
            )
            .fetch_one(pool)
            .await?
        } else {
            sqlx::query_scalar!(
                r#"SELECT COALESCE(MAX(position), -1) + 1 as "pos!: i32"
                   FROM document_folders
                   WHERE parent_id IS NULL AND team_id = $1"#,
                data.team_id
            )
            .fetch_one(pool)
            .await?
        };

        sqlx::query_as!(
            DocumentFolder,
            r#"INSERT INTO document_folders (id, team_id, parent_id, name, icon, color, local_path, position)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         parent_id as "parent_id: Uuid",
                         name,
                         icon,
                         color,
                         local_path,
                         position as "position!: i32",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.team_id,
            data.parent_id,
            data.name,
            data.icon,
            data.color,
            data.local_path,
            max_position
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: &UpdateDocumentFolder,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let parent_id = if data.parent_id.is_some() {
            data.parent_id
        } else {
            existing.parent_id
        };
        let name = data.name.as_ref().unwrap_or(&existing.name);
        let icon = data.icon.clone().or(existing.icon);
        let color = data.color.clone().or(existing.color);
        let local_path = data.local_path.clone().or(existing.local_path);
        let position = data.position.unwrap_or(existing.position);

        sqlx::query_as!(
            DocumentFolder,
            r#"UPDATE document_folders
               SET parent_id = $2, name = $3, icon = $4, color = $5, local_path = $6, position = $7,
                   updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         parent_id as "parent_id: Uuid",
                         name,
                         icon,
                         color,
                         local_path,
                         position as "position!: i32",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            parent_id,
            name,
            icon,
            color,
            local_path,
            position
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM document_folders WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Find a folder by name and parent_id within a team, or create it if it doesn't exist
    pub async fn find_or_create_by_name(
        pool: &PgPool,
        team_id: Uuid,
        parent_id: Option<Uuid>,
        name: &str,
    ) -> Result<Self, sqlx::Error> {
        // Try to find existing folder
        let existing = if let Some(pid) = parent_id {
            sqlx::query_as!(
                DocumentFolder,
                r#"SELECT id as "id!: Uuid",
                          team_id as "team_id!: Uuid",
                          parent_id as "parent_id: Uuid",
                          name,
                          icon,
                          color,
                          local_path,
                          position as "position!: i32",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM document_folders
                   WHERE team_id = $1 AND parent_id = $2 AND name = $3"#,
                team_id,
                pid,
                name
            )
            .fetch_optional(pool)
            .await?
        } else {
            sqlx::query_as!(
                DocumentFolder,
                r#"SELECT id as "id!: Uuid",
                          team_id as "team_id!: Uuid",
                          parent_id as "parent_id: Uuid",
                          name,
                          icon,
                          color,
                          local_path,
                          position as "position!: i32",
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM document_folders
                   WHERE team_id = $1 AND parent_id IS NULL AND name = $2"#,
                team_id,
                name
            )
            .fetch_optional(pool)
            .await?
        };

        if let Some(folder) = existing {
            return Ok(folder);
        }

        // Create new folder
        Self::create(pool, &CreateDocumentFolder {
            team_id,
            parent_id,
            name: name.to_string(),
            icon: None,
            color: None,
            local_path: None,
        }).await
    }
}

impl Document {
    pub async fn find_all_by_team(
        pool: &PgPool,
        team_id: Uuid,
        include_archived: bool,
    ) -> Result<Vec<Self>, sqlx::Error> {
        if include_archived {
            sqlx::query_as!(
                Document,
                r#"SELECT id as "id!: Uuid",
                          team_id as "team_id!: Uuid",
                          folder_id as "folder_id: Uuid",
                          title,
                          slug,
                          content,
                          file_path,
                          file_type,
                          file_size as "file_size: i64",
                          mime_type,
                          icon,
                          is_pinned as "is_pinned!: bool",
                          is_archived as "is_archived!: bool",
                          position as "position!: i32",
                          created_by,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM documents
                   WHERE team_id = $1
                   ORDER BY is_pinned DESC, position ASC, updated_at DESC"#,
                team_id
            )
            .fetch_all(pool)
            .await
        } else {
            sqlx::query_as!(
                Document,
                r#"SELECT id as "id!: Uuid",
                          team_id as "team_id!: Uuid",
                          folder_id as "folder_id: Uuid",
                          title,
                          slug,
                          content,
                          file_path,
                          file_type,
                          file_size as "file_size: i64",
                          mime_type,
                          icon,
                          is_pinned as "is_pinned!: bool",
                          is_archived as "is_archived!: bool",
                          position as "position!: i32",
                          created_by,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM documents
                   WHERE team_id = $1 AND is_archived = FALSE
                   ORDER BY is_pinned DESC, position ASC, updated_at DESC"#,
                team_id
            )
            .fetch_all(pool)
            .await
        }
    }

    pub async fn find_by_folder(
        pool: &PgPool,
        team_id: Uuid,
        folder_id: Option<Uuid>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        if let Some(fid) = folder_id {
            sqlx::query_as!(
                Document,
                r#"SELECT id as "id!: Uuid",
                          team_id as "team_id!: Uuid",
                          folder_id as "folder_id: Uuid",
                          title,
                          slug,
                          content,
                          file_path,
                          file_type,
                          file_size as "file_size: i64",
                          mime_type,
                          icon,
                          is_pinned as "is_pinned!: bool",
                          is_archived as "is_archived!: bool",
                          position as "position!: i32",
                          created_by,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM documents
                   WHERE team_id = $1 AND folder_id = $2 AND is_archived = FALSE
                   ORDER BY is_pinned DESC, position ASC, updated_at DESC"#,
                team_id,
                fid
            )
            .fetch_all(pool)
            .await
        } else {
            sqlx::query_as!(
                Document,
                r#"SELECT id as "id!: Uuid",
                          team_id as "team_id!: Uuid",
                          folder_id as "folder_id: Uuid",
                          title,
                          slug,
                          content,
                          file_path,
                          file_type,
                          file_size as "file_size: i64",
                          mime_type,
                          icon,
                          is_pinned as "is_pinned!: bool",
                          is_archived as "is_archived!: bool",
                          position as "position!: i32",
                          created_by,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>"
                   FROM documents
                   WHERE team_id = $1 AND folder_id IS NULL AND is_archived = FALSE
                   ORDER BY is_pinned DESC, position ASC, updated_at DESC"#,
                team_id
            )
            .fetch_all(pool)
            .await
        }
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Document,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      folder_id as "folder_id: Uuid",
                      title,
                      slug,
                      content,
                      file_path,
                      file_type,
                      file_size as "file_size: i64",
                      mime_type,
                      icon,
                      is_pinned as "is_pinned!: bool",
                      is_archived as "is_archived!: bool",
                      position as "position!: i32",
                      created_by,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM documents
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find a document by slug within a team
    pub async fn find_by_slug(
        pool: &PgPool,
        team_id: Uuid,
        slug: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Document,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      folder_id as "folder_id: Uuid",
                      title,
                      slug,
                      content,
                      file_path,
                      file_type,
                      file_size as "file_size: i64",
                      mime_type,
                      icon,
                      is_pinned as "is_pinned!: bool",
                      is_archived as "is_archived!: bool",
                      position as "position!: i32",
                      created_by,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM documents
               WHERE team_id = $1 AND slug = $2"#,
            team_id,
            slug
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn search(
        pool: &PgPool,
        team_id: Uuid,
        query: &str,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let search_pattern = format!("%{}%", query);
        sqlx::query_as!(
            Document,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id!: Uuid",
                      folder_id as "folder_id: Uuid",
                      title,
                      slug,
                      content,
                      file_path,
                      file_type,
                      file_size as "file_size: i64",
                      mime_type,
                      icon,
                      is_pinned as "is_pinned!: bool",
                      is_archived as "is_archived!: bool",
                      position as "position!: i32",
                      created_by,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM documents
               WHERE team_id = $1 AND is_archived = FALSE
                 AND (title LIKE $2 OR content LIKE $2)
               ORDER BY is_pinned DESC, updated_at DESC"#,
            team_id,
            search_pattern
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(pool: &PgPool, data: &CreateDocument) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let file_type = data.file_type.clone().unwrap_or_else(|| "markdown".to_string());
        let slug = generate_slug(&data.title);

        // Get max position for ordering
        let max_position: i32 = if let Some(folder_id) = data.folder_id {
            sqlx::query_scalar!(
                r#"SELECT COALESCE(MAX(position), -1) + 1 as "pos!: i32"
                   FROM documents
                   WHERE folder_id = $1 AND team_id = $2"#,
                folder_id,
                data.team_id
            )
            .fetch_one(pool)
            .await?
        } else {
            sqlx::query_scalar!(
                r#"SELECT COALESCE(MAX(position), -1) + 1 as "pos!: i32"
                   FROM documents
                   WHERE folder_id IS NULL AND team_id = $1"#,
                data.team_id
            )
            .fetch_one(pool)
            .await?
        };

        sqlx::query_as!(
            Document,
            r#"INSERT INTO documents (id, team_id, folder_id, title, slug, content, file_type, icon, position)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         folder_id as "folder_id: Uuid",
                         title,
                         slug,
                         content,
                         file_path,
                         file_type,
                         file_size as "file_size: i64",
                         mime_type,
                         icon,
                         is_pinned as "is_pinned!: bool",
                         is_archived as "is_archived!: bool",
                         position as "position!: i32",
                         created_by,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.team_id,
            data.folder_id,
            data.title,
            slug,
            data.content,
            file_type,
            data.icon,
            max_position
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: &UpdateDocument,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let folder_id = if data.folder_id.is_some() {
            data.folder_id
        } else {
            existing.folder_id
        };
        let title = data.title.as_ref().unwrap_or(&existing.title);
        // Regenerate slug if title changed
        let slug = if data.title.is_some() {
            Some(generate_slug(title))
        } else {
            existing.slug
        };
        let content = data.content.clone().or(existing.content);
        let icon = data.icon.clone().or(existing.icon);
        let is_pinned = data.is_pinned.unwrap_or(existing.is_pinned);
        let is_archived = data.is_archived.unwrap_or(existing.is_archived);
        let position = data.position.unwrap_or(existing.position);

        sqlx::query_as!(
            Document,
            r#"UPDATE documents
               SET folder_id = $2, title = $3, slug = $4, content = $5, icon = $6, is_pinned = $7,
                   is_archived = $8, position = $9, updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         folder_id as "folder_id: Uuid",
                         title,
                         slug,
                         content,
                         file_path,
                         file_type,
                         file_size as "file_size: i64",
                         mime_type,
                         icon,
                         is_pinned as "is_pinned!: bool",
                         is_archived as "is_archived!: bool",
                         position as "position!: i32",
                         created_by,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            folder_id,
            title,
            slug,
            content,
            icon,
            is_pinned,
            is_archived,
            position
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("DELETE FROM documents WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Update file metadata after upload
    pub async fn update_file_metadata(
        pool: &PgPool,
        id: Uuid,
        file_path: &str,
        file_size: i64,
        mime_type: &str,
        file_type: &str,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Document,
            r#"UPDATE documents
               SET file_path = $2, file_size = $3, mime_type = $4, file_type = $5,
                   updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         team_id as "team_id!: Uuid",
                         folder_id as "folder_id: Uuid",
                         title,
                         slug,
                         content,
                         file_path,
                         file_type,
                         file_size as "file_size: i64",
                         mime_type,
                         icon,
                         is_pinned as "is_pinned!: bool",
                         is_archived as "is_archived!: bool",
                         position as "position!: i32",
                         created_by,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            file_path,
            file_size,
            mime_type,
            file_type
        )
        .fetch_one(pool)
        .await
    }
}
