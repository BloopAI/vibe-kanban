//! File content reader for various document types
//!
//! Provides functionality to read and extract content from different file types:
//! - Text files (txt, md, json, xml, html, csv)
//! - PDF files (text extraction)
//! - Images (base64 encoding)
//! - Binary files (metadata only)

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use std::path::Path;
use thiserror::Error;
use tokio::fs;

#[derive(Error, Debug)]
pub enum FileReaderError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("File not found: {0}")]
    NotFound(String),
    #[error("PDF extraction error: {0}")]
    PdfError(String),
    #[error("CSV parsing error: {0}")]
    CsvError(String),
    #[error("Unsupported file type: {0}")]
    UnsupportedType(String),
}

/// Content extracted from a file
#[derive(Debug, Clone)]
pub struct FileContent {
    /// The content type (text, csv, pdf_text, image_base64, binary)
    pub content_type: ContentType,
    /// The actual content (text content or base64 for images)
    pub content: String,
    /// Optional structured data (for CSV)
    pub structured_data: Option<CsvData>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ContentType {
    /// Plain text content (md, txt, json, xml, html)
    Text,
    /// CSV content with structured data
    Csv,
    /// Extracted text from PDF
    PdfText,
    /// Base64-encoded image
    ImageBase64,
    /// Binary file - content contains metadata description
    Binary,
}

/// Structured CSV data
#[derive(Debug, Clone)]
pub struct CsvData {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

/// Read file content based on file type
pub async fn read_file_content(file_path: &str) -> Result<FileContent, FileReaderError> {
    let path = Path::new(file_path);

    if !path.exists() {
        return Err(FileReaderError::NotFound(file_path.to_string()));
    }

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        // Text-based files - read as UTF-8
        "md" | "markdown" | "txt" | "json" | "xml" | "html" | "htm" => {
            read_text_file(file_path).await
        }

        // CSV files - parse into structured data
        "csv" => read_csv_file(file_path).await,

        // PDF files - extract text
        "pdf" => read_pdf_file(file_path).await,

        // Image files - return as base64
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => {
            read_image_file(file_path).await
        }

        // Binary/Office files - return metadata
        "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" => {
            read_binary_file(file_path, &extension).await
        }

        // Unknown type - try to read as text, fallback to binary
        _ => {
            match read_text_file(file_path).await {
                Ok(content) => Ok(content),
                Err(_) => read_binary_file(file_path, &extension).await,
            }
        }
    }
}

/// Read a text file
async fn read_text_file(file_path: &str) -> Result<FileContent, FileReaderError> {
    let content = fs::read_to_string(file_path).await?;
    Ok(FileContent {
        content_type: ContentType::Text,
        content,
        structured_data: None,
    })
}

/// Read and parse a CSV file
async fn read_csv_file(file_path: &str) -> Result<FileContent, FileReaderError> {
    let raw_content = fs::read_to_string(file_path).await?;

    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(raw_content.as_bytes());

    // Get headers
    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| FileReaderError::CsvError(e.to_string()))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    // Get rows (limit to first 1000 rows for performance)
    let mut rows: Vec<Vec<String>> = Vec::new();
    for (i, result) in reader.records().enumerate() {
        if i >= 1000 {
            break;
        }
        match result {
            Ok(record) => {
                rows.push(record.iter().map(|f| f.to_string()).collect());
            }
            Err(e) => {
                tracing::warn!("CSV parsing error at row {}: {}", i, e);
            }
        }
    }

    // Also include raw content for display
    Ok(FileContent {
        content_type: ContentType::Csv,
        content: raw_content,
        structured_data: Some(CsvData { headers, rows }),
    })
}

/// Read and extract text from a PDF file
async fn read_pdf_file(file_path: &str) -> Result<FileContent, FileReaderError> {
    let file_path = file_path.to_string();

    // PDF extraction is CPU-bound, run in blocking task
    let content = tokio::task::spawn_blocking(move || {
        extract_pdf_text(&file_path)
    })
    .await
    .map_err(|e| FileReaderError::PdfError(e.to_string()))??;

    Ok(FileContent {
        content_type: ContentType::PdfText,
        content,
        structured_data: None,
    })
}

/// Extract text from PDF using pdf-extract
fn extract_pdf_text(file_path: &str) -> Result<String, FileReaderError> {
    match pdf_extract::extract_text(file_path) {
        Ok(text) => {
            // Clean up the extracted text
            let cleaned = text
                .lines()
                .map(|line| line.trim())
                .filter(|line| !line.is_empty())
                .collect::<Vec<_>>()
                .join("\n");

            if cleaned.is_empty() {
                Ok("[PDF contains no extractable text - may be image-based or scanned]".to_string())
            } else {
                Ok(cleaned)
            }
        }
        Err(e) => {
            // Return a user-friendly message instead of failing
            tracing::warn!("PDF text extraction failed for {}: {}", file_path, e);
            Ok(format!("[Could not extract text from PDF: {}]", e))
        }
    }
}

/// Read an image file and return as base64
async fn read_image_file(file_path: &str) -> Result<FileContent, FileReaderError> {
    let bytes = fs::read(file_path).await?;
    let base64_content = BASE64.encode(&bytes);

    // Determine mime type for data URL
    let extension = Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let mime_type = match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    };

    // Return as data URL for easy embedding
    let data_url = format!("data:{};base64,{}", mime_type, base64_content);

    Ok(FileContent {
        content_type: ContentType::ImageBase64,
        content: data_url,
        structured_data: None,
    })
}

/// Read a binary file and return metadata
async fn read_binary_file(file_path: &str, extension: &str) -> Result<FileContent, FileReaderError> {
    let metadata = fs::metadata(file_path).await?;
    let size_kb = metadata.len() / 1024;

    let file_type_description = match extension {
        "doc" => "Microsoft Word Document (Legacy)",
        "docx" => "Microsoft Word Document",
        "xls" => "Microsoft Excel Spreadsheet (Legacy)",
        "xlsx" => "Microsoft Excel Spreadsheet",
        "ppt" => "Microsoft PowerPoint Presentation (Legacy)",
        "pptx" => "Microsoft PowerPoint Presentation",
        _ => "Binary File",
    };

    let content = format!(
        "[{} - {} KB]\n\nThis file type cannot be displayed directly in the browser.\nUse the file path to open with an appropriate application.",
        file_type_description,
        size_kb
    );

    Ok(FileContent {
        content_type: ContentType::Binary,
        content,
        structured_data: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_read_text_file() {
        let mut file = NamedTempFile::with_suffix(".txt").unwrap();
        writeln!(file, "Hello, World!").unwrap();

        let result = read_file_content(file.path().to_str().unwrap()).await.unwrap();
        assert_eq!(result.content_type, ContentType::Text);
        assert!(result.content.contains("Hello, World!"));
    }

    #[tokio::test]
    async fn test_read_csv_file() {
        let mut file = NamedTempFile::with_suffix(".csv").unwrap();
        writeln!(file, "name,age,city").unwrap();
        writeln!(file, "Alice,30,NYC").unwrap();
        writeln!(file, "Bob,25,LA").unwrap();

        let result = read_file_content(file.path().to_str().unwrap()).await.unwrap();
        assert_eq!(result.content_type, ContentType::Csv);

        let csv_data = result.structured_data.unwrap();
        assert_eq!(csv_data.headers, vec!["name", "age", "city"]);
        assert_eq!(csv_data.rows.len(), 2);
        assert_eq!(csv_data.rows[0], vec!["Alice", "30", "NYC"]);
    }
}
