#[cfg(feature = "vk-billing")]
use std::sync::Arc;

#[cfg(feature = "vk-billing")]
pub use billing::{
    BillingError, BillingProvider, BillingStatus, BillingStatusResponse, CreatePortalRequest,
};

#[derive(Clone)]
pub struct BillingService {
    #[cfg(feature = "vk-billing")]
    provider: Option<Arc<dyn BillingProvider>>,
}

impl BillingService {
    #[cfg(feature = "vk-billing")]
    pub fn new(provider: Option<Arc<dyn BillingProvider>>) -> Self {
        Self { provider }
    }

    #[cfg(not(feature = "vk-billing"))]
    pub fn new() -> Self {
        Self {}
    }

    pub fn is_configured(&self) -> bool {
        #[cfg(feature = "vk-billing")]
        {
            self.provider.is_some()
        }
        #[cfg(not(feature = "vk-billing"))]
        {
            false
        }
    }

    /// Returns the billing provider if configured.
    #[cfg(feature = "vk-billing")]
    pub fn provider(&self) -> Option<Arc<dyn BillingProvider>> {
        self.provider.clone()
    }

    /// Returns None when billing feature is disabled.
    #[cfg(not(feature = "vk-billing"))]
    pub fn provider(&self) -> Option<std::convert::Infallible> {
        None
    }
}

#[cfg(not(feature = "vk-billing"))]
impl Default for BillingService {
    fn default() -> Self {
        Self::new()
    }
}
