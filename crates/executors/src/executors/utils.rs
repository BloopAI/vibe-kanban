use std::{
    hash::Hash,
    num::NonZeroUsize,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use lru::LruCache;

use super::SlashCommandDescription;
use crate::executors::BaseCodingAgent;

/// Parsed slash command with name and arguments.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlashCommandCall<'a> {
    /// The command name in lowercase (without the leading slash)
    pub name: String,
    /// The arguments after the command name
    pub arguments: &'a str,
}

/// Parse a slash command from a prompt string.
///
/// Returns `Some(T)` if the prompt starts with a slash command,
/// or `None` if it doesn't look like a slash command.
///
/// The return type `T` must implement `From<SlashCommandCall>`.
pub fn parse_slash_command<'a, T>(prompt: &'a str) -> Option<T>
where
    T: From<SlashCommandCall<'a>>,
{
    let trimmed = prompt.trim_start();
    let without_slash = trimmed.strip_prefix('/')?;
    let mut parts = without_slash.splitn(2, |ch: char| ch.is_whitespace());
    let name = parts.next()?.trim().to_lowercase();
    if name.is_empty() {
        return None;
    }
    let arguments = parts.next().map(|s| s.trim()).unwrap_or("");
    Some(T::from(SlashCommandCall { name, arguments }))
}

pub const SLASH_COMMANDS_CACHE_CAPACITY: usize = 32;
pub const DEFAULT_CACHE_TTL: Duration = Duration::from_secs(60 * 5);

/// Reorder slash commands to prioritize compact then review.
#[must_use]
pub fn reorder_slash_commands(
    commands: impl IntoIterator<Item = SlashCommandDescription>,
) -> Vec<SlashCommandDescription> {
    let mut compact_command = None;
    let mut review_commands = None;
    let mut remaining_commands = Vec::new();

    for command in commands {
        match command.name.as_str() {
            "compact" => compact_command = Some(command),
            "review" => review_commands = Some(command),
            _ => remaining_commands.push(command),
        }
    }

    compact_command
        .into_iter()
        .chain(review_commands)
        .chain(remaining_commands)
        .collect()
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct SlashCommandCacheKey {
    path: PathBuf,
    executor_id: String,
}

impl SlashCommandCacheKey {
    /// Create a new cache key for an executor.
    pub fn new(path: impl Into<PathBuf>, executor: &BaseCodingAgent) -> Self {
        Self {
            path: path.into(),
            executor_id: executor.to_string(),
        }
    }
}

#[derive(Clone, Debug)]
struct CacheEntry<V> {
    cached_at: Instant,
    value: Arc<V>,
}

pub struct TtlCache<K, V> {
    cache: Mutex<LruCache<K, CacheEntry<V>>>,
    ttl: Duration,
}

impl<K, V> TtlCache<K, V>
where
    K: Hash + Eq,
{
    pub fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            cache: Mutex::new(LruCache::new(
                NonZeroUsize::new(capacity).unwrap_or_else(|| NonZeroUsize::new(1).unwrap()),
            )),
            ttl,
        }
    }

    #[must_use]
    pub fn get(&self, key: &K) -> Option<Arc<V>> {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        let entry = cache.get(key)?;
        let value = entry.value.clone();
        let expired = entry.cached_at.elapsed() > self.ttl;
        if expired {
            cache.pop(key);
            None
        } else {
            Some(value)
        }
    }

    pub fn put(&self, key: K, value: V) {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.put(
            key,
            CacheEntry {
                cached_at: Instant::now(),
                value: Arc::new(value),
            },
        );
    }
}
