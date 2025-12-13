use std::time::Duration;

use async_trait::async_trait;
use serde_json::json;

use crate::db::organization_members::MemberRole;

const LOOPS_INVITE_TEMPLATE_ID: &str = "cmhvy2wgs3s13z70i1pxakij9";
const LOOPS_REVIEW_READY_TEMPLATE_ID: &str = "cmj47k5ge16990iylued9by17";
const LOOPS_REVIEW_FAILED_TEMPLATE_ID: &str = "cmj49ougk1c8s0iznavijdqpo";

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

    async fn send_review_ready(&self, email: &str, review_url: &str, pr_name: &str) {
        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending review ready email to {email}\n\
                 PR: {pr_name}\n\
                 Review URL: {review_url}"
            );
        }

        let payload = json!({
            "transactionalId": LOOPS_REVIEW_READY_TEMPLATE_ID,
            "email": email,
            "dataVariables": {
                "review_url": review_url,
                "pr_name": pr_name,
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
                tracing::debug!("Review ready email sent via Loops to {email}");
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                tracing::warn!(status = %status, body = %body, "Loops send failed for review ready");
            }
            Err(err) => {
                tracing::error!(error = ?err, "Loops request error for review ready");
            }
        }
    }

    async fn send_review_failed(&self, email: &str, pr_name: &str, review_id: &str) {
        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending review failed email to {email}\n\
                 PR: {pr_name}\n\
                 Review ID: {review_id}"
            );
        }

        let payload = json!({
            "transactionalId": LOOPS_REVIEW_FAILED_TEMPLATE_ID,
            "email": email,
            "dataVariables": {
                "pr_name": pr_name,
                "review_id": review_id,
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
                tracing::debug!("Review failed email sent via Loops to {email}");
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                tracing::warn!(status = %status, body = %body, "Loops send failed for review failed");
            }
            Err(err) => {
                tracing::error!(error = ?err, "Loops request error for review failed");
            }
        }
    }
}
