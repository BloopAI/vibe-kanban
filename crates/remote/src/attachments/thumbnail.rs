use image::{DynamicImage, imageops::FilterType};

const THUMBNAIL_MAX_WIDTH: u32 = 200;
const THUMBNAIL_MAX_HEIGHT: u32 = 150;
const THUMBNAIL_JPEG_QUALITY: u8 = 80;

#[derive(Debug)]
pub struct ThumbnailResult {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub original_width: u32,
    pub original_height: u32,
    pub mime_type: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ThumbnailError {
    #[error("unsupported image format")]
    UnsupportedFormat,
    #[error("image decode error: {0}")]
    DecodeError(String),
    #[error("image encode error: {0}")]
    EncodeError(String),
}

pub struct ThumbnailService;

impl ThumbnailService {
    /// Generate a thumbnail from image bytes.
    /// Returns None for non-image MIME types.
    pub fn generate(data: &[u8], mime_type: Option<&str>) -> Result<Option<ThumbnailResult>, ThumbnailError> {
        // Check if it's an image MIME type we support
        let is_supported_image = mime_type
            .map(|m| {
                matches!(
                    m.to_lowercase().as_str(),
                    "image/png" | "image/jpeg" | "image/jpg" | "image/gif" | "image/webp"
                )
            })
            .unwrap_or(false);

        if !is_supported_image {
            return Ok(None);
        }

        // Decode the image
        let img = image::load_from_memory(data)
            .map_err(|e| ThumbnailError::DecodeError(e.to_string()))?;

        let original_width = img.width();
        let original_height = img.height();

        // Calculate thumbnail dimensions preserving aspect ratio
        let (thumb_width, thumb_height) =
            calculate_thumbnail_dimensions(original_width, original_height);

        let thumbnail = img.resize(thumb_width, thumb_height, FilterType::Lanczos3);
        let jpeg_bytes = encode_jpeg(&thumbnail, THUMBNAIL_JPEG_QUALITY)?;

        Ok(Some(ThumbnailResult {
            bytes: jpeg_bytes,
            width: thumb_width,
            height: thumb_height,
            original_width,
            original_height,
            mime_type: "image/jpeg".to_string(),
        }))
    }
}

/// Calculate thumbnail dimensions preserving aspect ratio.
fn calculate_thumbnail_dimensions(width: u32, height: u32) -> (u32, u32) {
    if width <= THUMBNAIL_MAX_WIDTH && height <= THUMBNAIL_MAX_HEIGHT {
        return (width, height);
    }

    let width_ratio = THUMBNAIL_MAX_WIDTH as f64 / width as f64;
    let height_ratio = THUMBNAIL_MAX_HEIGHT as f64 / height as f64;
    let ratio = width_ratio.min(height_ratio);

    let new_width = (width as f64 * ratio).round() as u32;
    let new_height = (height as f64 * ratio).round() as u32;

    (new_width.max(1), new_height.max(1))
}

/// Encode a DynamicImage as JPEG with specified quality.
fn encode_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, ThumbnailError> {
    let rgb = img.to_rgb8();
    let mut output = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, quality);
    encoder
        .encode_image(&rgb)
        .map_err(|e| ThumbnailError::EncodeError(e.to_string()))?;
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_dimensions_smaller_than_max() {
        let (w, h) = calculate_thumbnail_dimensions(100, 80);
        assert_eq!((w, h), (100, 80));
    }

    #[test]
    fn test_calculate_dimensions_landscape() {
        let (w, h) = calculate_thumbnail_dimensions(800, 600);
        // 800x600 aspect ratio = 4:3
        // Max width 200, height would be 150
        assert_eq!((w, h), (200, 150));
    }

    #[test]
    fn test_calculate_dimensions_portrait() {
        let (w, h) = calculate_thumbnail_dimensions(600, 800);
        // 600x800 aspect ratio = 3:4
        // Max height 150, width would be 112
        assert_eq!((w, h), (112, 150));
    }

    #[test]
    fn test_unsupported_mime_type() {
        let result = ThumbnailService::generate(b"not an image", Some("application/pdf")).unwrap();
        assert!(result.is_none());
    }
}
