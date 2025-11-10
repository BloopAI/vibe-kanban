use async_trait::async_trait;

use crate::db::identity::MemberRole;

#[async_trait]
pub trait Mailer: Send + Sync {
    async fn send_org_invitation(
        &self,
        org_slug: &str,
        email: &str,
        accept_url: &str,
        role: MemberRole,
        invited_by: Option<&str>,
    );
}

pub struct NoopMailer;

#[async_trait]
impl Mailer for NoopMailer {
    async fn send_org_invitation(
        &self,
        org_slug: &str,
        email: &str,
        accept_url: &str,
        role: MemberRole,
        invited_by: Option<&str>,
    ) {
        let role_str = match role {
            MemberRole::Admin => "admin",
            MemberRole::Member => "member",
        };
        let inviter = invited_by.unwrap_or("someone");

        tracing::info!(
            "STUB: Would send invitation email to {email}\n\
             Organization: {org_slug}\n\
             Role: {role_str}\n\
             Invited by: {inviter}\n\
             Accept URL: {accept_url}"
        );
    }
}
