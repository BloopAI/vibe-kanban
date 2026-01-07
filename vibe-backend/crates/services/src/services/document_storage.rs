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

    /// Get the mime type for a file extension (internal)
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

    /// Get the mime type for a file type (public API)
    pub fn get_mime_type_for_file_type(&self, file_type: &str) -> String {
        Self::get_mime_type(file_type).to_string()
    }

    /// Sanitize a title for use as a filename
    /// Replaces invalid characters, handles spaces, and limits length
    fn sanitize_filename(title: &str) -> String {
        // Replace characters that are invalid in filenames
        let sanitized: String = title
            .chars()
            .map(|c| match c {
                // Replace invalid filename characters with dash
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
                // Keep alphanumeric, spaces, dashes, underscores, dots
                c if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '.' => c,
                // Replace other special chars with dash
                _ => '-',
            })
            .collect();

        // Replace multiple consecutive dashes/spaces with single dash
        let mut result = String::new();
        let mut last_was_separator = false;
        for c in sanitized.chars() {
            if c == ' ' || c == '-' {
                if !last_was_separator && !result.is_empty() {
                    result.push('-');
                    last_was_separator = true;
                }
            } else {
                result.push(c);
                last_was_separator = false;
            }
        }

        // Trim dashes from start and end
        let result = result.trim_matches('-').to_string();

        // Limit length to 100 characters (reasonable filename length)
        if result.len() > 100 {
            result[..100].trim_end_matches('-').to_string()
        } else if result.is_empty() {
            "untitled".to_string()
        } else {
            result
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

    /// Generate a file path for a new document using title
    /// If a file with the same name exists, append a number suffix
    fn generate_file_path_with_title(
        &self,
        team_id: Uuid,
        title: &str,
        file_type: &str,
        custom_path: Option<&str>,
        subfolder: Option<&str>,
    ) -> PathBuf {
        let extension = Self::get_extension(file_type);
        let sanitized_title = Self::sanitize_filename(title);

        let mut base_dir = self.team_documents_dir(team_id, custom_path);

        // If a subfolder is specified, append it to the path
        if let Some(folder) = subfolder {
            if !folder.is_empty() {
                base_dir = base_dir.join(folder);
            }
        }

        // Try the base filename first
        let base_filename = format!("{}.{}", sanitized_title, extension);
        let mut file_path = base_dir.join(&base_filename);

        // If file exists, append a number suffix to make it unique
        let mut counter = 1;
        while file_path.exists() {
            let numbered_filename = format!("{}-{}.{}", sanitized_title, counter, extension);
            file_path = base_dir.join(numbered_filename);
            counter += 1;

            // Safety limit to prevent infinite loop
            if counter > 1000 {
                // Fall back to UUID if too many conflicts
                file_path = base_dir.join(format!("{}-{}.{}", sanitized_title, Uuid::new_v4(), extension));
                break;
            }
        }

        file_path
    }

    /// Generate a file path for a new document (legacy, uses UUID)
    #[allow(dead_code)]
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

    /// Write document content to filesystem using human-readable title as filename
    /// Returns the file path and file size
    pub async fn write_document_with_title(
        &self,
        team_id: Uuid,
        title: &str,
        content: &str,
        file_type: &str,
        custom_path: Option<&str>,
        subfolder: Option<&str>,
    ) -> Result<DocumentFileInfo, DocumentStorageError> {
        // Ensure base directory exists
        let mut target_dir = self.team_documents_dir(team_id, custom_path);

        // If subfolder specified, create it
        if let Some(folder) = subfolder {
            if !folder.is_empty() {
                target_dir = target_dir.join(folder);
            }
        }

        if !target_dir.exists() {
            fs::create_dir_all(&target_dir).await?;
        }

        let file_path =
            self.generate_file_path_with_title(team_id, title, file_type, custom_path, subfolder);
        fs::write(&file_path, content.as_bytes()).await?;

        let file_size = content.len() as i64;
        let mime_type = Self::get_mime_type(file_type);

        Ok(DocumentFileInfo {
            file_path: file_path.to_string_lossy().to_string(),
            file_size,
            mime_type: mime_type.to_string(),
        })
    }

    /// Write document content to filesystem (legacy, uses UUID as filename)
    #[allow(dead_code)]
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

    /// Write document content to filesystem with optional custom path (legacy, uses UUID)
    #[allow(dead_code)]
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
