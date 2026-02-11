use thiserror::Error;

#[derive(Debug, Error)]
pub enum IdentityError {
    #[error("identity record not found")]
    NotFound,
    #[error("permission denied: admin access required")]
    PermissionDenied,
    #[error("invitation error: {0}")]
    InvitationError(String),
    #[error("cannot delete organization: {0}")]
    CannotDeleteOrganization(String),
    #[error("organization conflict: {0}")]
    OrganizationConflict(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[cfg(feature = "vk-billing")]
    #[error("billing error: {0}")]
    Billing(crate::billing::BillingCheckError),
}

#[cfg(feature = "vk-billing")]
impl From<crate::billing::BillingCheckError> for IdentityError {
    fn from(err: crate::billing::BillingCheckError) -> Self {
        Self::Billing(err)
    }
}

#[cfg(not(feature = "vk-billing"))]
impl From<crate::billing::BillingCheckError> for IdentityError {
    fn from(err: crate::billing::BillingCheckError) -> Self {
        match err {}
    }
}
