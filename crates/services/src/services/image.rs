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

/// Sanitize filename for filesystem safety:
/// - Lowercase
/// - Spaces → underscores
/// - Remove special characters (keep alphanumeric and underscores)
/// - Truncate if too long
fn sanitize_filename(name: &str) -> String {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");

    let clean: String = stem
        .to_lowercase()
        .chars()
        .map(|c| if c.is_whitespace() { '_' } else { c })
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .collect();

    // Truncate to reasonable length to avoid filesystem limits
    let max_len = 50;
    if clean.len() > max_len {
        clean[..max_len].to_string()
    } else if clean.is_empty() {
        "image".to_string()
    } else {
        clean
    }
}

#[derive(Clone)]
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
            "svg" => Some("image/svg+xml".to_string()),
            _ => None,
        };

        if mime_type.is_none() {
            return Err(ImageError::InvalidFormat);
        }

        let existing_image = Image::find_by_hash(&self.pool, &hash).await?;

        if let Some(existing) = existing_image {
            tracing::debug!("Reusing existing image record with hash {}", hash);
            return Ok(existing);
        }

        let clean_name = sanitize_filename(original_filename);
        let new_filename = format!("{}_{}.{}", Uuid::new_v4(), clean_name, extension);
        let cached_path = self.cache_dir.join(&new_filename);
        fs::write(&cached_path, data)?;

        let image = Image::create(
            &self.pool,
            &CreateImage {
                file_path: new_filename,
                original_name: original_filename.to_string(),
                mime_type,
                size_bytes: file_size as i64,
                hash,
            },
        )
        .await?;
        Ok(image)
    }

    pub async fn delete_orphaned_images(&self) -> Result<(), ImageError> {
        let orphaned_images = Image::find_orphaned_images(&self.pool).await?;
        if orphaned_images.is_empty() {
            tracing::debug!("No orphaned images found during cleanup");
            return Ok(());
        }

        tracing::debug!(
            "Found {} orphaned images to clean up",
            orphaned_images.len()
        );
        let mut deleted_count = 0;
        let mut failed_count = 0;

        for image in orphaned_images {
            match self.delete_image(image.id).await {
                Ok(_) => {
                    deleted_count += 1;
                    tracing::debug!("Deleted orphaned image: {}", image.id);
                }
                Err(e) => {
                    failed_count += 1;
                    tracing::error!("Failed to delete orphaned image {}: {}", image.id, e);
                }
            }
        }

        tracing::info!(
            "Image cleanup completed: {} deleted, {} failed",
            deleted_count,
            failed_count
        );

        Ok(())
    }

    pub fn get_absolute_path(&self, image: &Image) -> PathBuf {
        self.cache_dir.join(&image.file_path)
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

    pub async fn copy_images_by_workspace_to_worktree(
        &self,
        worktree_path: &Path,
        workspace_id: Uuid,
        agent_working_dir: Option<&str>,
    ) -> Result<(), ImageError> {
        let images = Image::find_by_workspace_id(&self.pool, workspace_id).await?;
        let target_path = match agent_working_dir {
            Some(dir) if !dir.is_empty() => worktree_path.join(dir),
            _ => worktree_path.to_path_buf(),
        };
        self.copy_images(&target_path, images)
    }

    pub async fn copy_images_by_ids_to_worktree(
        &self,
        worktree_path: &Path,
        image_ids: &[Uuid],
    ) -> Result<(), ImageError> {
        let mut images = Vec::new();
        for id in image_ids {
            if let Some(image) = Image::find_by_id(&self.pool, *id).await? {
                images.push(image);
            }
        }
        self.copy_images(worktree_path, images)
    }

    /// Copy images to the worktree. Skips images that already exist at target.
    fn copy_images(&self, worktree_path: &Path, images: Vec<Image>) -> Result<(), ImageError> {
        if images.is_empty() {
            return Ok(());
        }

        let images_dir = worktree_path.join(utils::path::VIBE_IMAGES_DIR);

        // Fast path: check if all images exist before doing anything
        let all_exist = images
            .iter()
            .all(|image| images_dir.join(&image.file_path).exists());
        if all_exist {
            return Ok(());
        }

        std::fs::create_dir_all(&images_dir)?;

        // Create .gitignore to ignore all files in this directory
        let gitignore_path = images_dir.join(".gitignore");
        if !gitignore_path.exists() {
            std::fs::write(&gitignore_path, "*\n")?;
        }

        for image in images {
            let src = self.cache_dir.join(&image.file_path);
            let dst = images_dir.join(&image.file_path);

            if dst.exists() {
                continue;
            }

            if src.exists() {
                if let Err(e) = std::fs::copy(&src, &dst) {
                    tracing::error!("Failed to copy {}: {}", image.file_path, e);
                } else {
                    tracing::debug!("Copied {}", image.file_path);
                }
            } else {
                tracing::warn!("Missing cache file: {}", src.display());
            }
        }

        Ok(())
    }
}
