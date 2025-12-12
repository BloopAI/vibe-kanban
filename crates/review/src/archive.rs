use std::{fs::File, path::Path};

use flate2::{Compression, write::GzEncoder};
use tar::Builder;
use tracing::debug;

use crate::error::ReviewError;

/// Create a tar.gz archive from a directory
pub fn create_tarball(source_dir: &Path) -> Result<Vec<u8>, ReviewError> {
    debug!("Creating tarball from {}", source_dir.display());

    let mut buffer = Vec::new();

    {
        let encoder = GzEncoder::new(&mut buffer, Compression::default());
        let mut archive = Builder::new(encoder);

        add_directory_to_archive(&mut archive, source_dir, source_dir)?;

        let encoder = archive
            .into_inner()
            .map_err(|e| ReviewError::ArchiveFailed(e.to_string()))?;
        encoder
            .finish()
            .map_err(|e| ReviewError::ArchiveFailed(e.to_string()))?;
    }

    debug!("Created tarball: {} bytes", buffer.len());

    Ok(buffer)
}

fn add_directory_to_archive<W: std::io::Write>(
    archive: &mut Builder<W>,
    base_dir: &Path,
    current_dir: &Path,
) -> Result<(), ReviewError> {
    let entries =
        std::fs::read_dir(current_dir).map_err(|e| ReviewError::ArchiveFailed(e.to_string()))?;

    for entry in entries {
        let entry = entry.map_err(|e| ReviewError::ArchiveFailed(e.to_string()))?;
        let path = entry.path();

        let relative_path = path
            .strip_prefix(base_dir)
            .map_err(|e| ReviewError::ArchiveFailed(e.to_string()))?;

        let metadata = entry
            .metadata()
            .map_err(|e| ReviewError::ArchiveFailed(e.to_string()))?;

        if metadata.is_dir() {
            // Recursively add directory contents
            add_directory_to_archive(archive, base_dir, &path)?;
        } else if metadata.is_file() {
            // Add file to archive
            let mut file =
                File::open(&path).map_err(|e| ReviewError::ArchiveFailed(e.to_string()))?;
            archive
                .append_file(relative_path, &mut file)
                .map_err(|e| ReviewError::ArchiveFailed(e.to_string()))?;
        }
        // Skip symlinks and other special files
    }

    Ok(())
}

#[cfg(test)]
mod tests {

    use tempfile::TempDir;

    use super::*;

    #[test]
    fn test_create_tarball() {
        let temp_dir = TempDir::new().unwrap();
        let base = temp_dir.path();

        // Create some test files
        std::fs::write(base.join("file1.txt"), "content1").unwrap();
        std::fs::create_dir(base.join("subdir")).unwrap();
        std::fs::write(base.join("subdir/file2.txt"), "content2").unwrap();

        let tarball = create_tarball(base).expect("Should create tarball");

        // Verify tarball is not empty
        assert!(!tarball.is_empty());

        // Decompress and verify contents
        let decoder = flate2::read::GzDecoder::new(&tarball[..]);
        let mut archive = tar::Archive::new(decoder);

        let entries: Vec<_> = archive
            .entries()
            .unwrap()
            .map(|e| e.unwrap().path().unwrap().to_string_lossy().to_string())
            .collect();

        assert!(entries.contains(&"file1.txt".to_string()));
        assert!(entries.contains(&"subdir/file2.txt".to_string()));
    }
}
