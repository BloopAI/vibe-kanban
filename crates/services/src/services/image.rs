use std::{
    fs,
    path::{Path, PathBuf},
};

use db::models::image::{CreateImage, Image};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum ImageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Invalid image format")]
    InvalidFormat,

    #[error("Image too large: {0} bytes (max: {1} bytes)")]
    TooLarge(u64, u64),

    #[error("Image not found")]
    NotFound,

    #[error("Failed to build response: {0}")]
    ResponseBuildError(String),
}

pub struct ImageService {
    cache_dir: PathBuf,
    pool: SqlitePool,
    max_size_bytes: u64,
}

impl ImageService {
    pub fn new(pool: SqlitePool) -> Result<Self, ImageError> {
        let cache_dir = utils::cache_dir().join("images");
        fs::create_dir_all(&cache_dir)?;
        Ok(Self {
            cache_dir,
            pool,
            max_size_bytes: 20 * 1024 * 1024, // 20MB default
        })
    }

    pub async fn store_image(
        &self,
        data: &[u8],
        original_filename: &str,
    ) -> Result<Image, ImageError> {
        let file_size = data.len() as u64;

        if file_size > self.max_size_bytes {
            return Err(ImageError::TooLarge(file_size, self.max_size_bytes));
        }

        let hash = format!("{:x}", Sha256::digest(data));
        let existing_image = Image::find_by_hash(&self.pool, &hash).await?;

        // Extract extension from original filename
        let extension = Path::new(original_filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");

        let mime_type = match extension.to_lowercase().as_str() {
            "png" => Some("image/png".to_string()),
            "jpg" | "jpeg" => Some("image/jpeg".to_string()),
            "gif" => Some("image/gif".to_string()),
            "webp" => Some("image/webp".to_string()),
            "bmp" => Some("image/bmp".to_string()),
            _ => None,
        };

        if mime_type.is_none() {
            return Err(ImageError::InvalidFormat);
        }

        // Determine the cached filename - either reuse existing or create new
        let cached_filename = if let Some(ref existing) = existing_image {
            existing.file_path.clone()
        } else {
            let new_filename = format!("{}.{}", Uuid::new_v4(), extension);
            let cached_path = self.cache_dir.join(&new_filename);
            fs::write(&cached_path, data)?;
            new_filename
        };

        let image = Image::create(
            &self.pool,
            &CreateImage {
                file_path: cached_filename,
                original_name: original_filename.to_string(),
                mime_type,
                size_bytes: file_size as i64,
                hash,
                task_id: None,
                execution_process_id: None,
            },
        )
        .await?;
        Ok(image)
    }

    pub fn get_absolute_path(&self, image: &Image) -> PathBuf {
        self.cache_dir.join(&image.file_path)
    }

    pub async fn attach_to_execution_process(
        &self,
        image_id: Uuid,
        execution_process_id: Uuid,
    ) -> Result<(), ImageError> {
        Image::set_execution_process_id(&self.pool, image_id, Some(execution_process_id)).await?;
        Ok(())
    }

    pub async fn get_execution_process_images(
        &self,
        execution_process_id: Uuid,
    ) -> Result<Vec<Image>, ImageError> {
        Ok(Image::find_by_execution_process_id(&self.pool, execution_process_id).await?)
    }

    pub async fn get_image(&self, id: Uuid) -> Result<Option<Image>, ImageError> {
        Ok(Image::find_by_id(&self.pool, id).await?)
    }

    pub async fn delete_image(&self, id: Uuid) -> Result<(), ImageError> {
        if let Some(image) = Image::find_by_id(&self.pool, id).await? {
            let file_path = self.cache_dir.join(&image.file_path);
            if file_path.exists() {
                fs::remove_file(file_path)?;
            }

            Image::delete(&self.pool, id).await?;
        }

        Ok(())
    }
}
