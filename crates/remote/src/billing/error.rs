use thiserror::Error;

#[derive(Debug, Error)]
pub enum BillingError {
    #[error("billing not configured")]
    NotConfigured,
    #[error("subscription required: {0}")]
    SubscriptionRequired(String),
    #[error("subscription inactive")]
    SubscriptionInactive,
    #[error("stripe error: {0}")]
    Stripe(String),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("organization not found")]
    OrganizationNotFound,
}
