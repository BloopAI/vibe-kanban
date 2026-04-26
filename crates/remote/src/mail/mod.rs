mod loops;
mod smtp;

use api_types::MemberRole;
use async_trait::async_trait;
pub use loops::LoopsMailer;
pub use smtp::SmtpMailer;

use crate::digest::DigestError;

pub const DIGEST_PREVIEW_COUNT: usize = 5;

#[derive(Debug, Clone)]
pub struct DigestContact<'a> {
    pub email: &'a str,
    pub user_id: &'a str,
    pub first_name: Option<&'a str>,
    pub last_name: Option<&'a str>,
}

#[derive(Debug, Clone)]
pub struct DigestNotificationItem {
    pub title: String,
    pub body: String,
    pub url: String,
}

#[async_trait]
pub trait Mailer: Send + Sync {
    async fn send_org_invitation(
        &self,
        org_name: &str,
        email: &str,
        accept_url: &str,
        role: MemberRole,
        invited_by: Option<&str>,
    );

    async fn send_review_ready(&self, email: &str, review_url: &str, pr_name: &str);

    async fn send_review_failed(&self, email: &str, pr_name: &str, review_id: &str);

    async fn send_digest_event(
        &self,
        contact: &DigestContact<'_>,
        notification_count: i32,
        items: &[DigestNotificationItem],
        notifications_url: &str,
    ) -> Result<(), DigestError>;
}

/// No-op mailer used when no email provider is configured.
pub struct NoopMailer;

#[async_trait]
impl Mailer for NoopMailer {
    async fn send_org_invitation(
        &self,
        org_name: &str,
        email: &str,
        _accept_url: &str,
        _role: MemberRole,
        _invited_by: Option<&str>,
    ) {
        tracing::warn!(
            email = %email,
            org_name = %org_name,
            "Email not configured — skipping org invitation. Set SMTP_* or LOOPS_EMAIL_API_KEY to enable."
        );
    }

    async fn send_review_ready(&self, email: &str, _review_url: &str, pr_name: &str) {
        tracing::warn!(
            email = %email,
            pr_name = %pr_name,
            "Email not configured — skipping review ready. Set SMTP_* or LOOPS_EMAIL_API_KEY to enable."
        );
    }

    async fn send_review_failed(&self, email: &str, pr_name: &str, _review_id: &str) {
        tracing::warn!(
            email = %email,
            pr_name = %pr_name,
            "Email not configured — skipping review failed. Set SMTP_* or LOOPS_EMAIL_API_KEY to enable."
        );
    }

    async fn send_digest_event(
        &self,
        contact: &DigestContact<'_>,
        notification_count: i32,
        _items: &[DigestNotificationItem],
        _notifications_url: &str,
    ) -> Result<(), DigestError> {
        tracing::warn!(
            email = %contact.email,
            notification_count,
            "Email not configured — skipping digest. Set SMTP_* or LOOPS_EMAIL_API_KEY to enable."
        );

        Ok(())
    }
}
