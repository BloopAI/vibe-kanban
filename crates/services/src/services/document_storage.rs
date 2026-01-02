use std::path::PathBuf;
use thiserror::Error;
use tokio::fs;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum DocumentStorageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Document not found at path: {0}")]
    NotFound(String),
    #[error("Invalid file extension")]
    InvalidExtension,
    #[error("Invalid storage path: {0}")]
    InvalidPath(String),
    #[error("Path is not writable: {0}")]
    NotWritable(String),
}

/// Service for storing documents on the filesystem
#[derive(Clone)]
pub struct DocumentStorageService {
    base_path: PathBuf,
}

impl DocumentStorageService {
    /// Create a new DocumentStorageService with the given base path
    /// Documents will be stored under {base_path}/documents/{team_id}/
    pub fn new(base_path: PathBuf) -> Self {
        Self { base_path }
    }

    /// Get the documents directory for a team
    /// If custom_path is provided, use it directly; otherwise use default
    fn team_documents_dir(&self, team_id: Uuid, custom_path: Option<&str>) -> PathBuf {
        if let Some(path) = custom_path {
            PathBuf::from(path)
        } else {
            self.base_path
                .join("documents")
                .join(team_id.to_string())
        }
    }

    /// Validate that a storage path exists and is writable
    pub async fn validate_storage_path(path: &str) -> Result<(), DocumentStorageError> {
        let path_buf = PathBuf::from(path);

        // Check if path exists
        if !path_buf.exists() {
            // Try to create it
            fs::create_dir_all(&path_buf).await.map_err(|_| {
                DocumentStorageError::InvalidPath(format!(
                    "Path does not exist and cannot be created: {}",
                    path
                ))
            })?;
        }

        // Check if path is a directory
        if !path_buf.is_dir() {
            return Err(DocumentStorageError::InvalidPath(format!(
                "Path is not a directory: {}",
                path
            )));
        }

        // Check if writable by creating a temp file
        let test_file = path_buf.join(".vibe-kanban-test");
        match fs::write(&test_file, b"test").await {
            Ok(_) => {
                let _ = fs::remove_file(&test_file).await;
                Ok(())
            }
            Err(_) => Err(DocumentStorageError::NotWritable(path.to_string())),
        }
    }

    /// Get the file extension for a document type
    fn get_extension(file_type: &str) -> &'static str {
        match file_type.to_lowercase().as_str() {
            "markdown" | "md" => "md",
            "pdf" => "pdf",
            "txt" | "text" => "txt",
            "csv" => "csv",
            "xlsx" | "excel" => "xlsx",
            _ => "md",
        }
    }

    /// Get the mime type for a file extension
    fn get_mime_type(file_type: &str) -> &'static str {
        match file_type.to_lowercase().as_str() {
            "markdown" | "md" => "text/markdown",
            "pdf" => "application/pdf",
            "txt" | "text" => "text/plain",
            "csv" => "text/csv",
            "xlsx" | "excel" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            _ => "text/markdown",
        }
    }

    /// Ensure the team's documents directory exists
    async fn ensure_team_dir(
        &self,
        team_id: Uuid,
        custom_path: Option<&str>,
    ) -> Result<PathBuf, DocumentStorageError> {
        let dir = self.team_documents_dir(team_id, custom_path);
        if !dir.exists() {
            fs::create_dir_all(&dir).await?;
        }
        Ok(dir)
    }

    /// Generate a file path for a new document
    fn generate_file_path(
        &self,
        team_id: Uuid,
        document_id: Uuid,
        file_type: &str,
        custom_path: Option<&str>,
    ) -> PathBuf {
        let extension = Self::get_extension(file_type);
        self.team_documents_dir(team_id, custom_path)
            .join(format!("{}.{}", document_id, extension))
    }

    /// Write document content to filesystem
    /// Returns the file path and file size
    /// If custom_path is provided, store documents there instead of default location
    pub async fn write_document(
        &self,
        team_id: Uuid,
        document_id: Uuid,
        content: &str,
        file_type: &str,
    ) -> Result<DocumentFileInfo, DocumentStorageError> {
        self.write_document_with_path(team_id, document_id, content, file_type, None)
            .await
    }

    /// Write document content to filesystem with optional custom path
    pub async fn write_document_with_path(
        &self,
        team_id: Uuid,
        document_id: Uuid,
        content: &str,
        file_type: &str,
        custom_path: Option<&str>,
    ) -> Result<DocumentFileInfo, DocumentStorageError> {
        self.ensure_team_dir(team_id, custom_path).await?;

        let file_path = self.generate_file_path(team_id, document_id, file_type, custom_path);
        fs::write(&file_path, content.as_bytes()).await?;

        let file_size = content.len() as i64;
        let mime_type = Self::get_mime_type(file_type);

        Ok(DocumentFileInfo {
            file_path: file_path.to_string_lossy().to_string(),
            file_size,
            mime_type: mime_type.to_string(),
        })
    }

    /// Read document content from filesystem
    pub async fn read_document(&self, file_path: &str) -> Result<String, DocumentStorageError> {
        let path = PathBuf::from(file_path);
        if !path.exists() {
            return Err(DocumentStorageError::NotFound(file_path.to_string()));
        }

        let content = fs::read_to_string(&path).await?;
        Ok(content)
    }

    /// Delete a document from filesystem
    pub async fn delete_document(&self, file_path: &str) -> Result<(), DocumentStorageError> {
        let path = PathBuf::from(file_path);
        if path.exists() {
            fs::remove_file(&path).await?;
        }
        Ok(())
    }

    /// Move/rename a document (useful when changing file type)
    pub async fn move_document(
        &self,
        old_path: &str,
        team_id: Uuid,
        document_id: Uuid,
        new_file_type: &str,
        custom_path: Option<&str>,
    ) -> Result<DocumentFileInfo, DocumentStorageError> {
        let old_path_buf = PathBuf::from(old_path);

        // Read existing content
        let content = if old_path_buf.exists() {
            fs::read_to_string(&old_path_buf).await?
        } else {
            String::new()
        };

        // Write to new location
        let info = self
            .write_document_with_path(team_id, document_id, &content, new_file_type, custom_path)
            .await?;

        // Delete old file if different path
        if old_path != info.file_path && old_path_buf.exists() {
            fs::remove_file(&old_path_buf).await?;
        }

        Ok(info)
    }

    /// Delete all documents in a team's folder
    pub async fn delete_team_documents(
        &self,
        team_id: Uuid,
        custom_path: Option<&str>,
    ) -> Result<(), DocumentStorageError> {
        let dir = self.team_documents_dir(team_id, custom_path);
        if dir.exists() {
            fs::remove_dir_all(&dir).await?;
        }
        Ok(())
    }
}

/// Information about a stored document file
#[derive(Debug, Clone)]
pub struct DocumentFileInfo {
    pub file_path: String,
    pub file_size: i64,
    pub mime_type: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_write_and_read_document() {
        let temp_dir = TempDir::new().unwrap();
        let service = DocumentStorageService::new(temp_dir.path().to_path_buf());

        let team_id = Uuid::new_v4();
        let document_id = Uuid::new_v4();
        let content = "# Test Document\n\nThis is a test.";

        // Write document
        let info = service
            .write_document(team_id, document_id, content, "markdown")
            .await
            .unwrap();

        assert!(info.file_path.ends_with(".md"));
        assert_eq!(info.file_size, content.len() as i64);
        assert_eq!(info.mime_type, "text/markdown");

        // Read document
        let read_content = service.read_document(&info.file_path).await.unwrap();
        assert_eq!(read_content, content);
    }

    #[tokio::test]
    async fn test_delete_document() {
        let temp_dir = TempDir::new().unwrap();
        let service = DocumentStorageService::new(temp_dir.path().to_path_buf());

        let team_id = Uuid::new_v4();
        let document_id = Uuid::new_v4();
        let content = "Test content";

        // Write document
        let info = service
            .write_document(team_id, document_id, content, "txt")
            .await
            .unwrap();

        // Delete document
        service.delete_document(&info.file_path).await.unwrap();

        // Verify deleted
        let result = service.read_document(&info.file_path).await;
        assert!(matches!(result, Err(DocumentStorageError::NotFound(_))));
    }
}
