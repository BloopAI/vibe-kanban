//! macOS-native notification system using `UNUserNotificationCenter`.
//!
//! Bypasses `tauri-plugin-notification` (which has no desktop click handling)
//! and uses the native UserNotifications framework directly. A
//! `UNUserNotificationCenterDelegate` receives click callbacks with the
//! `deeplinkPath` stored in `userInfo`, then emits a Tauri event so the
//! frontend can navigate.

use std::sync::{
    Once, OnceLock,
    atomic::{AtomicBool, Ordering},
};

use block2::RcBlock;
use objc2::{
    AllocAnyThread, define_class, msg_send,
    rc::Retained,
    runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject},
};
use objc2_foundation::{NSBundle, NSDictionary, NSError, NSString, ns_string};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNMutableNotificationContent, UNNotification,
    UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse,
    UNNotificationSound, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};
use tauri::{Emitter, Manager};

/// Global app handle so the delegate can emit events and show the window.
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Whether native notifications are available (requires a proper app bundle).
/// False in dev mode where the binary runs outside a .app bundle.
static AVAILABLE: AtomicBool = AtomicBool::new(false);

/// Returns the shared `UNUserNotificationCenter` singleton.
/// Called on-demand rather than stored in a static because
/// `Retained<UNUserNotificationCenter>` is not `Send + Sync`.
///
/// # Panics
/// Panics if called without a valid app bundle — always check `AVAILABLE` first.
fn center() -> Retained<UNUserNotificationCenter> {
    UNUserNotificationCenter::currentNotificationCenter()
}

// ---------------------------------------------------------------------------
// Delegate
// ---------------------------------------------------------------------------

define_class!(
    #[unsafe(super = NSObject)]
    #[name = "VKNotifDelegate"]
    #[derive(Debug)]
    struct VKNotifDelegate;

    unsafe impl NSObjectProtocol for VKNotifDelegate {}

    unsafe impl UNUserNotificationCenterDelegate for VKNotifDelegate {
        /// Called when a notification arrives while the app is in the foreground.
        /// We ask the system to still show it as a banner + in Notification Center.
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        unsafe fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &block2::Block<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            let options = UNNotificationPresentationOptions::List
                | UNNotificationPresentationOptions::Sound
                | UNNotificationPresentationOptions::Banner;
            completion_handler.call((options,));
        }

        /// Called when the user **clicks** a notification (the actual click event).
        /// Extracts `deeplinkPath` from `userInfo` and emits a Tauri event.
        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        unsafe fn did_receive_notification(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            completion_handler: &block2::Block<dyn Fn()>,
        ) {
            // Always show/focus the window when a notification is clicked.
            if let Some(handle) = APP_HANDLE.get() {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }

                // If the notification carries a deeplink path, emit an event
                // so the frontend can navigate to the relevant page.
                let user_info = response.notification().request().content().userInfo();
                let deeplink = user_info.valueForKey(ns_string!("deeplinkPath"));

                if let Some(value) = deeplink
                    && let Ok(path) = value.downcast::<NSString>()
                {
                    let path_str = path.to_string();
                    tracing::info!("Notification clicked, navigating to {path_str}");
                    let _ = handle.emit(
                        "notification-clicked",
                        serde_json::json!({ "deeplinkPath": path_str }),
                    );
                }
            }

            completion_handler.call(());
        }
    }
);

impl VKNotifDelegate {
    fn new() -> Retained<Self> {
        let this = Self::alloc().set_ivars(());
        unsafe { msg_send![super(this), init] }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Must be called once during Tauri `setup()`, before any notifications are
/// shown. Requests authorisation and installs the delegate.
pub fn initialize(app_handle: tauri::AppHandle) {
    static INIT: Once = Once::new();

    let _ = APP_HANDLE.set(app_handle);

    INIT.call_once(|| {
        // UNUserNotificationCenter requires a properly code-signed .app
        // bundle registered with Launch Services. In dev builds the binary
        // isn't bundled correctly, so notifications get attributed to
        // Script Editor and lack the app icon.
        if cfg!(debug_assertions) {
            tracing::info!(
                "Debug build — native macOS notifications disabled (would open Script Editor)"
            );
            return;
        }

        let has_bundle = NSBundle::mainBundle().bundleIdentifier().is_some();
        if !has_bundle {
            tracing::warn!("No bundle identifier found — native macOS notifications disabled");
            return;
        }
        AVAILABLE.store(true, Ordering::Relaxed);

        unsafe {
            // Request permission (Provisional lets us show quietly without a
            // prompt — the user can later enable prominent delivery in System
            // Settings).
            center().requestAuthorizationWithOptions_completionHandler(
                UNAuthorizationOptions::Alert
                    | UNAuthorizationOptions::Provisional
                    | UNAuthorizationOptions::Sound,
                &RcBlock::new(|ok: Bool, err: *mut NSError| {
                    if ok.is_false() {
                        let msg = if err.is_null() {
                            "unknown error".to_string()
                        } else {
                            (*err).localizedDescription().to_string()
                        };
                        tracing::error!(
                            "Notification authorization denied: {msg}. \
                         The app must be code-signed for UNUserNotificationCenter to work."
                        );
                    }
                }),
            );

            // Create and install the delegate. We intentionally leak it via
            // `Retained::into_raw` so it stays alive for the entire app lifetime
            // (delegates are only weakly retained by the notification center).
            let delegate = VKNotifDelegate::new();
            let delegate_proto = ProtocolObject::from_retained(delegate.clone());
            center().setDelegate(Some(&delegate_proto));
            Retained::into_raw(delegate);
        }
    });
}

/// Show a native macOS notification. When the user clicks it, the delegate
/// will emit a `notification-clicked` Tauri event with the `deeplink_path`.
/// Returns `true` if native macOS notifications are available.
/// Returns `false` in dev mode (no app bundle).
pub fn is_available() -> bool {
    AVAILABLE.load(Ordering::Relaxed)
}

pub fn show_notification(title: &str, body: &str, deeplink_path: Option<&str>) {
    if !is_available() {
        tracing::debug!("Native notifications unavailable — skipping");
        return;
    }

    unsafe {
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(title));
        content.setBody(&NSString::from_str(body));
        content.setSound(Some(&UNNotificationSound::defaultSound()));

        if let Some(path) = deeplink_path {
            let keys: &[&NSString] = &[ns_string!("deeplinkPath")];
            let values: &[&NSString] = &[&*NSString::from_str(path)];
            let info = NSDictionary::from_slices(keys, values);
            content.setUserInfo(
                info.downcast_ref::<NSDictionary>()
                    .expect("is NSDictionary"),
            );
        }

        let identifier = uuid::Uuid::new_v4().to_string();
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &NSString::from_str(&identifier),
            &content,
            None,
        );

        center().addNotificationRequest_withCompletionHandler(
            &request,
            Some(&RcBlock::new(move |err: *mut NSError| {
                if !err.is_null() {
                    let msg = (*err).localizedDescription().to_string();
                    tracing::error!(
                        "Failed to show notification: {msg}. \
                         The app must be code-signed for UNUserNotificationCenter to work."
                    );
                }
            })),
        );
    }
}
