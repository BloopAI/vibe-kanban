use std::time::Duration;

use async_trait::async_trait;
use serde_json::json;

use crate::db::organization_members::MemberRole;

const LOOPS_INVITE_TEMPLATE_ID: &str = "cmhvy2wgs3s13z70i1pxakij9";

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
}

pub struct LoopsMailer {
    client: reqwest::Client,
    api_key: String,
}

impl LoopsMailer {
    pub fn new(api_key: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("failed to build reqwest client");

        Self { client, api_key }
    }
}

#[async_trait]
impl Mailer for LoopsMailer {
    async fn send_org_invitation(
        &self,
        org_name: &str,
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

        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending invitation email to {email}\n\
                 Organization: {org_name}\n\
                 Role: {role_str}\n\
                 Invited by: {inviter}\n\
                 Accept URL: {accept_url}"
            );
        }

        let payload = json!({
            "transactionalId": LOOPS_INVITE_TEMPLATE_ID,
            "email": email,
            "dataVariables": {
                "org_name": org_name,
                "accept_url": accept_url,
                "invited_by": inviter,
            }
        });

        let res = self
            .client
            .post("https://app.loops.so/api/v1/transactional")
            .bearer_auth(&self.api_key)
            .json(&payload)
            .send()
            .await;

        match res {
            Ok(resp) if resp.status().is_success() => {
                tracing::debug!("Invitation email sent via Loops to {email}");
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                tracing::warn!(status = %status, body = %body, "Loops send failed");
            }
            Err(err) => {
                tracing::error!(error = ?err, "Loops request error");
            }
        }
    }
}
