use std::fs;
use std::io;
use std::path::PathBuf;

use futures::stream::BoxStream;
use uuid::Uuid;

use utils::log_msg::LogMsg;

const DEFAULT_MAX_BYTES: u64 = 128 * 1024 * 1024; // 128 MiB

/// Disk-backed cache for pre-serialized normalized log lines.
///
/// Each execution process gets its own `{id}.jsonl` file inside `cache_dir`.
/// When the total size exceeds `max_bytes`, the oldest files (by mtime) are
/// evicted first (simple LRU).
#[derive(Clone, Debug)]
pub struct NormalizedLogCache {
    cache_dir: PathBuf,
    max_bytes: u64,
}

impl NormalizedLogCache {
    /// Create a new cache using `VK_NORMALIZED_LOG_CACHE_DIR` (if set) or a
    /// temp-directory fallback, with the default 128 MiB budget.
    pub fn new() -> io::Result<Self> {
        let dir = match std::env::var("VK_NORMALIZED_LOG_CACHE_DIR") {
            Ok(d) => PathBuf::from(d),
            Err(_) => std::env::temp_dir().join("vk-normalized-logs"),
        };
        Self::with_dir(dir, DEFAULT_MAX_BYTES)
    }

    /// Create a cache rooted at `dir` with an explicit size budget.
    pub fn with_dir(dir: PathBuf, max_bytes: u64) -> io::Result<Self> {
        fs::create_dir_all(&dir)?;
        Ok(Self {
            cache_dir: dir,
            max_bytes,
        })
    }

    /// Returns `true` if a cache file exists for the given id.
    pub fn has(&self, id: &Uuid) -> bool {
        self.cache_path(id).exists()
    }

    fn cache_path(&self, id: &Uuid) -> PathBuf {
        self.cache_dir.join(format!("{id}.jsonl"))
    }

    /// Open (or create) the cache file for `id` in append mode and return a
    /// [`CacheWriter`] that can be used to stream lines into it.
    pub fn writer(&self, id: &Uuid) -> io::Result<CacheWriter> {
        let file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.cache_path(id))?;
        Ok(CacheWriter { file })
    }

    /// Read all cached lines for `id`, returning `None` if the file does not
    /// exist. The file's mtime is explicitly touched so that recently-read
    /// entries are less likely to be evicted.
    pub fn read_lines(&self, id: &Uuid) -> Option<Vec<String>> {
        let path = self.cache_path(id);
        if !path.exists() {
            return None;
        }
        let contents = fs::read_to_string(&path).ok()?;
        // Touch mtime so recently-read entries are less likely to be evicted.
        let _ = fs::File::open(&path).and_then(|f| f.set_modified(std::time::SystemTime::now()));
        Some(
            contents
                .lines()
                .filter(|l| !l.is_empty())
                .map(String::from)
                .collect(),
        )
    }

    /// Delete the oldest `.jsonl` files until the total cache size is within
    /// the configured `max_bytes` budget.
    pub fn evict_if_needed(&self) {
        let entries: Vec<_> = match fs::read_dir(&self.cache_dir) {
            Ok(rd) => rd
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.path()
                        .extension()
                        .is_some_and(|ext| ext == "jsonl")
                })
                .collect(),
            Err(_) => return,
        };

        let mut files: Vec<(PathBuf, u64, std::time::SystemTime)> = entries
            .iter()
            .filter_map(|e| {
                let meta = e.metadata().ok()?;
                let mtime = meta.modified().ok()?;
                Some((e.path(), meta.len(), mtime))
            })
            .collect();

        let total: u64 = files.iter().map(|(_, size, _)| size).sum();
        if total <= self.max_bytes {
            return;
        }

        // Sort oldest-first so we can delete from the front.
        files.sort_by_key(|(_, _, mtime)| *mtime);

        let mut remaining = total;
        for (path, size, _) in &files {
            if remaining <= self.max_bytes {
                break;
            }
            if fs::remove_file(path).is_ok() {
                remaining = remaining.saturating_sub(*size);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// CacheWriter
// ---------------------------------------------------------------------------

/// Appends pre-serialized JSON lines to a cache file.
pub struct CacheWriter {
    file: fs::File,
}

impl CacheWriter {
    /// Write a single JSON line (the trailing newline is added automatically).
    pub fn append_line(&mut self, json_line: &str) -> io::Result<()> {
        use std::io::Write;
        writeln!(self.file, "{}", json_line)
    }

    /// Flush the underlying file buffer.
    pub fn flush(&mut self) -> io::Result<()> {
        use std::io::Write;
        self.file.flush()
    }
}

// ---------------------------------------------------------------------------
// NormalizedLogStream
// ---------------------------------------------------------------------------

/// Distinguishes between a live/DB `LogMsg` stream (which still needs serde
/// serialization at the WebSocket layer) and pre-serialized lines read from
/// the disk cache (which can be sent as-is).
pub enum NormalizedLogStream {
    /// LogMsg stream from live MsgStore or DB normalization -- needs serde on
    /// WS send.
    Messages(BoxStream<'static, Result<LogMsg, io::Error>>),
    /// Pre-serialized JSON lines from disk cache -- send directly as WS Text
    /// frames.
    Cached(Vec<String>),
}
