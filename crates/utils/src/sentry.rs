use std::sync::{
    OnceLock,
    atomic::{AtomicBool, Ordering},
};

use sentry_tracing::{EventFilter, SentryLayer};
use tracing::Level;

const SENTRY_DSN: &str = "https://1065a1d276a581316999a07d5dffee26@o4509603705192449.ingest.de.sentry.io/4509605576441937";

static INIT_GUARD: OnceLock<sentry::ClientInitGuard> = OnceLock::new();

/// Controls whether Sentry events are sent. Default is disabled (user opt-in).
static SENTRY_DISABLED: AtomicBool = AtomicBool::new(true);

#[derive(Clone, Copy, Debug)]
pub enum SentrySource {
    Backend,
    Mcp,
}

impl SentrySource {
    fn tag(self) -> &'static str {
        match self {
            SentrySource::Backend => "backend",
            SentrySource::Mcp => "mcp",
        }
    }
}

fn environment() -> &'static str {
    if cfg!(debug_assertions) {
        "dev"
    } else {
        "production"
    }
}

/// Enable Sentry event sending (called when user opts in)
pub fn enable_sentry() {
    SENTRY_DISABLED.store(false, Ordering::SeqCst);
    tracing::info!("Sentry error reporting enabled");
}

/// Disable Sentry event sending (called when user opts out)
pub fn disable_sentry() {
    SENTRY_DISABLED.store(true, Ordering::SeqCst);
    tracing::info!("Sentry error reporting disabled by user preference");
}

/// Check if Sentry is currently disabled by user preference
pub fn is_sentry_disabled() -> bool {
    SENTRY_DISABLED.load(Ordering::SeqCst)
}

/// Apply Sentry enabled state from config
pub fn set_sentry_enabled(enabled: bool) {
    if enabled {
        enable_sentry();
    } else {
        disable_sentry();
    }
}

pub fn init_once(source: SentrySource) {
    INIT_GUARD.get_or_init(|| {
        sentry::init((
            SENTRY_DSN,
            sentry::ClientOptions {
                release: sentry::release_name!(),
                environment: Some(environment().into()),
                before_send: Some(std::sync::Arc::new(|event| {
                    if SENTRY_DISABLED.load(Ordering::SeqCst) {
                        None // Drop the event when disabled
                    } else {
                        Some(event)
                    }
                })),
                ..Default::default()
            },
        ))
    });

    sentry::configure_scope(|scope| {
        scope.set_tag("source", source.tag());
    });
}

pub fn configure_user_scope(user_id: &str, username: Option<&str>, email: Option<&str>) {
    let mut sentry_user = sentry::User {
        id: Some(user_id.to_string()),
        ..Default::default()
    };

    if let Some(username) = username {
        sentry_user.username = Some(username.to_string());
    }

    if let Some(email) = email {
        sentry_user.email = Some(email.to_string());
    }

    sentry::configure_scope(|scope| {
        scope.set_user(Some(sentry_user));
    });
}

pub fn sentry_layer<S>() -> SentryLayer<S>
where
    S: tracing::Subscriber,
    S: for<'a> tracing_subscriber::registry::LookupSpan<'a>,
{
    SentryLayer::default()
        .span_filter(|meta| {
            matches!(
                *meta.level(),
                Level::DEBUG | Level::INFO | Level::WARN | Level::ERROR
            )
        })
        .event_filter(|meta| match *meta.level() {
            Level::ERROR => EventFilter::Event,
            Level::DEBUG | Level::INFO | Level::WARN => EventFilter::Breadcrumb,
            Level::TRACE => EventFilter::Ignore,
        })
}
