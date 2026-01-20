#[cfg(feature = "vk-billing")]
use std::sync::Arc;

#[cfg(feature = "vk-billing")]
pub use billing::{
    BillingError, BillingProvider, BillingStatus, BillingStatusResponse, CreateCheckoutRequest,
    CreatePortalRequest,
};
use uuid::Uuid;

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

    /// Returns Ok(()) if billing allows adding a member, or if billing is disabled/not configured.
    pub async fn can_add_member(&self, _org_id: Uuid) -> Result<(), BillingCheckError> {
        #[cfg(feature = "vk-billing")]
        if let Some(provider) = &self.provider {
            provider
                .can_add_member(_org_id)
                .await
                .map_err(BillingCheckError::Billing)?;
        }
        Ok(())
    }

    /// Notifies billing of member count changes. No-op if billing disabled.
    pub async fn on_member_count_changed(&self, _org_id: Uuid) {
        #[cfg(feature = "vk-billing")]
        if let Some(provider) = &self.provider {
            if let Err(e) = provider.on_member_count_changed(_org_id).await {
                tracing::warn!(?e, %_org_id, "Failed to notify billing of member count change");
            }
        }
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

#[derive(Debug)]
pub enum BillingCheckError {
    #[cfg(feature = "vk-billing")]
    Billing(BillingError),
}

impl std::fmt::Display for BillingCheckError {
    fn fmt(&self, _f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        #[cfg(feature = "vk-billing")]
        match self {
            Self::Billing(e) => write!(_f, "{}", e),
        }
        #[cfg(not(feature = "vk-billing"))]
        {
            match *self {}
        }
    }
}

impl std::error::Error for BillingCheckError {}
