//! Resolves analytics and crash-reporting keys (PostHog, Sentry).
//!
//! Release builds only use values compiled in at build time, so a release
//! built without keys never sends usage analytics or crash reports, even when
//! the user's shell happens to export `POSTHOG_API_KEY` or `SENTRY_DSN`.
//! Debug builds also read the runtime environment, so local dev works without
//! a rebuild.

/// Returns the compiled-in value, or in debug builds only, the runtime
/// environment variable `name`. Empty values count as unset.
pub fn compiled_or_dev_env(compiled: Option<&str>, name: &str) -> Option<String> {
    resolve(compiled, cfg!(debug_assertions), || {
        std::env::var(name).ok()
    })
}

fn resolve(
    compiled: Option<&str>,
    allow_runtime: bool,
    runtime: impl FnOnce() -> Option<String>,
) -> Option<String> {
    non_empty(compiled.map(str::to_string))
        .or_else(|| non_empty(allow_runtime.then(runtime).flatten()))
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiled_value_wins() {
        assert_eq!(
            resolve(Some("built"), true, || Some("runtime".into())),
            Some("built".into())
        );
    }

    #[test]
    fn release_ignores_runtime_env() {
        assert_eq!(resolve(None, false, || panic!("must not read env")), None);
        assert_eq!(
            resolve(Some(""), false, || panic!("must not read env")),
            None
        );
    }

    #[test]
    fn debug_falls_back_to_runtime_env() {
        assert_eq!(
            resolve(None, true, || Some("runtime".into())),
            Some("runtime".into())
        );
        assert_eq!(
            resolve(Some(""), true, || Some("runtime".into())),
            Some("runtime".into())
        );
    }

    #[test]
    fn empty_values_are_unset() {
        assert_eq!(resolve(Some("  "), true, || Some(String::new())), None);
        assert_eq!(resolve(None, true, || None), None);
    }
}
