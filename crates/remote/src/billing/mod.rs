mod error;
mod types;

use async_trait::async_trait;
pub use error::BillingError;
pub use types::*;
use uuid::Uuid;

#[async_trait]
pub trait BillingProvider: Send + Sync {
    async fn can_add_member(&self, organization_id: Uuid) -> Result<(), BillingError>;

    async fn get_billing_status(
        &self,
        organization_id: Uuid,
    ) -> Result<BillingStatusResponse, BillingError>;

    async fn create_portal_session(
        &self,
        organization_id: Uuid,
        return_url: &str,
    ) -> Result<CustomerPortalSession, BillingError>;

    async fn create_checkout_session(
        &self,
        organization_id: Uuid,
        admin_email: &str,
        success_url: &str,
        cancel_url: &str,
    ) -> Result<CheckoutSession, BillingError>;

    async fn on_member_count_changed(&self, organization_id: Uuid) -> Result<(), BillingError>;

    async fn handle_webhook(&self, payload: &[u8], signature: &str) -> Result<(), BillingError>;
}

/// No-op billing provider for open-source builds.
pub struct StubBillingProvider;

#[async_trait]
impl BillingProvider for StubBillingProvider {
    async fn can_add_member(&self, _organization_id: Uuid) -> Result<(), BillingError> {
        Ok(())
    }

    async fn get_billing_status(
        &self,
        _organization_id: Uuid,
    ) -> Result<BillingStatusResponse, BillingError> {
        Ok(BillingStatusResponse {
            status: BillingStatus::Free,
            billing_enabled: false,
            seat_info: None,
        })
    }

    async fn create_portal_session(
        &self,
        _organization_id: Uuid,
        _return_url: &str,
    ) -> Result<CustomerPortalSession, BillingError> {
        Err(BillingError::NotConfigured)
    }

    async fn create_checkout_session(
        &self,
        _organization_id: Uuid,
        _admin_email: &str,
        _success_url: &str,
        _cancel_url: &str,
    ) -> Result<CheckoutSession, BillingError> {
        Err(BillingError::NotConfigured)
    }

    async fn on_member_count_changed(&self, _organization_id: Uuid) -> Result<(), BillingError> {
        Ok(())
    }

    async fn handle_webhook(&self, _payload: &[u8], _signature: &str) -> Result<(), BillingError> {
        Err(BillingError::NotConfigured)
    }
}
