use std::time::Duration;

use anyhow::{Context, bail};
use api_types::MemberRole;
use async_trait::async_trait;
use secrecy::{ExposeSecret, SecretString};
use serde_json::json;
use url::Url;

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

/// No-op mailer used when `LOOPS_EMAIL_API_KEY` is not configured.
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
            "Email service not configured — skipping org invitation email. Set LOOPS_EMAIL_API_KEY or NODEMAILER_SERVICE_URL/NODEMAILER_FROM to enable."
        );
    }

    async fn send_review_ready(&self, email: &str, _review_url: &str, pr_name: &str) {
        tracing::warn!(
            email = %email,
            pr_name = %pr_name,
            "Email service not configured — skipping review ready email. Set LOOPS_EMAIL_API_KEY or NODEMAILER_SERVICE_URL/NODEMAILER_FROM to enable."
        );
    }

    async fn send_review_failed(&self, email: &str, pr_name: &str, _review_id: &str) {
        tracing::warn!(
            email = %email,
            pr_name = %pr_name,
            "Email service not configured — skipping review failed email. Set LOOPS_EMAIL_API_KEY or NODEMAILER_SERVICE_URL/NODEMAILER_FROM to enable."
        );
    }
}

pub struct NodemailerMailer {
    client: reqwest::Client,
    service_url: Url,
    token: Option<SecretString>,
    from: String,
}

impl NodemailerMailer {
    pub fn from_env() -> anyhow::Result<Option<Self>> {
        let service_url = match std::env::var("NODEMAILER_SERVICE_URL") {
            Ok(v) if !v.is_empty() => v,
            _ => return Ok(None),
        };

        let service_url =
            Url::parse(&service_url).context("invalid value for NODEMAILER_SERVICE_URL")?;

        let from = std::env::var("NODEMAILER_FROM").unwrap_or_default();
        if from.is_empty() {
            bail!("NODEMAILER_FROM must be set when using Nodemailer mailer");
        }

        let token = match std::env::var("NODEMAILER_SERVICE_TOKEN") {
            Ok(v) if !v.is_empty() => Some(SecretString::new(v.into())),
            _ => None,
        };

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .context("failed to build reqwest client")?;

        Ok(Some(Self {
            client,
            service_url,
            token,
            from,
        }))
    }

    async fn send_message(
        &self,
        to: &str,
        subject: &str,
        text: &str,
        typ: &str,
        meta: serde_json::Value,
    ) {
        let payload = json!({
            "to": to,
            "from": &self.from,
            "subject": subject,
            "text": text,
            "type": typ,
            "meta": meta,
        });

        let mut req = self.client.post(self.service_url.clone()).json(&payload);
        if let Some(token) = &self.token {
            req = req.bearer_auth(token.expose_secret());
        }

        let res = req.send().await;
        match res {
            Ok(resp) if resp.status().is_success() => {
                tracing::debug!(email = %to, typ = %typ, "Email sent via Nodemailer service");
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                tracing::warn!(
                    status = %status,
                    body = %body,
                    typ = %typ,
                    "Nodemailer service send failed"
                );
            }
            Err(err) => {
                tracing::error!(error = ?err, typ = %typ, "Nodemailer service request error");
            }
        }
    }
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

#[async_trait]
impl Mailer for NodemailerMailer {
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

        let subject = format!("You're invited to join {org_name}");
        let text = format!(
            "You have been invited to join {org_name} as a {role_str}.\n\nInvited by: {inviter}\nAccept invitation: {accept_url}\n"
        );

        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending invitation email to {email}\n\
                 Organization: {org_name}\n\
                 Role: {role_str}\n\
                 Invited by: {inviter}\n\
                 Accept URL: {accept_url}"
            );
        }

        self.send_message(
            email,
            &subject,
            &text,
            "org_invitation",
            json!({
                "org_name": org_name,
                "accept_url": accept_url,
                "role": role_str,
                "invited_by": inviter,
            }),
        )
        .await;
    }

    async fn send_review_ready(&self, email: &str, review_url: &str, pr_name: &str) {
        let subject = format!("Review ready: {pr_name}");
        let text = format!(
            "Your review is ready for PR: {pr_name}\n\nView review: {review_url}\n"
        );

        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending review ready email to {email}\n\
                 PR: {pr_name}\n\
                 Review URL: {review_url}"
            );
        }

        self.send_message(
            email,
            &subject,
            &text,
            "review_ready",
            json!({
                "review_url": review_url,
                "pr_name": pr_name,
            }),
        )
        .await;
    }

    async fn send_review_failed(&self, email: &str, pr_name: &str, review_id: &str) {
        let subject = format!("Review failed: {pr_name}");
        let text = format!(
            "A review failed for PR: {pr_name}\n\nReview ID: {review_id}\n"
        );

        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending review failed email to {email}\n\
                 PR: {pr_name}\n\
                 Review ID: {review_id}"
            );
        }

        self.send_message(
            email,
            &subject,
            &text,
            "review_failed",
            json!({
                "pr_name": pr_name,
                "review_id": review_id,
            }),
        )
        .await;
    }
}
