use std::time::Duration;

use api_types::MemberRole;
use async_trait::async_trait;
use serde_json::json;

use crate::digest::DigestError;

const LOOPS_INVITE_TEMPLATE_ID: &str = "cmhvy2wgs3s13z70i1pxakij9";
const LOOPS_REVIEW_READY_TEMPLATE_ID: &str = "cmj47k5ge16990iylued9by17";
const LOOPS_REVIEW_FAILED_TEMPLATE_ID: &str = "cmj49ougk1c8s0iznavijdqpo";

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
            "Email service not configured — skipping org invitation email. Set LOOPS_EMAIL_API_KEY to enable."
        );
    }

    async fn send_review_ready(&self, email: &str, _review_url: &str, pr_name: &str) {
        tracing::warn!(
            email = %email,
            pr_name = %pr_name,
            "Email service not configured — skipping review ready email. Set LOOPS_EMAIL_API_KEY to enable."
        );
    }

    async fn send_review_failed(&self, email: &str, pr_name: &str, _review_id: &str) {
        tracing::warn!(
            email = %email,
            pr_name = %pr_name,
            "Email service not configured — skipping review failed email. Set LOOPS_EMAIL_API_KEY to enable."
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
            "Email service not configured — skipping digest event. Set LOOPS_EMAIL_API_KEY to enable."
        );

        Ok(())
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

    async fn send_digest_event(
        &self,
        contact: &DigestContact<'_>,
        notification_count: i32,
        items: &[DigestNotificationItem],
        notifications_url: &str,
    ) -> Result<(), DigestError> {
        if cfg!(debug_assertions) {
            tracing::info!(
                "Firing sendDigest event for {}\n\
                 User ID: {}\n\
                 First name: {:?}\n\
                 Last name: {:?}\n\
                 Total notifications: {notification_count}\n\
                 Items: {}\n\
                 Notifications URL: {notifications_url}",
                contact.email,
                contact.user_id,
                contact.first_name,
                contact.last_name,
                items.len()
            );
        }

        let mut event_properties = serde_json::Map::new();
        event_properties.insert("notificationCount".into(), json!(notification_count));
        event_properties.insert("notificationsUrl".into(), json!(notifications_url));

        for (i, item) in items.iter().take(DIGEST_PREVIEW_COUNT).enumerate() {
            event_properties.insert(format!("notification{i}Title"), json!(item.title));
            event_properties.insert(format!("notification{i}Body"), json!(item.body));
            event_properties.insert(format!("notification{i}Url"), json!(item.url));
        }

        let mut payload = json!({
            "email": contact.email,
            "userId": contact.user_id,
            "eventName": "sendDigest",
            "eventProperties": event_properties,
        });

        if let Some(first_name) = contact.first_name {
            payload["firstName"] = json!(first_name);
        }
        if let Some(last_name) = contact.last_name {
            payload["lastName"] = json!(last_name);
        }

        let res = self
            .client
            .post("https://app.loops.so/api/v1/events/send")
            .bearer_auth(&self.api_key)
            .json(&payload)
            .send()
            .await;

        match res {
            Ok(resp) if resp.status().is_success() => {
                tracing::debug!("Digest event fired via Loops for {}", contact.email);
                Ok(())
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                Err(DigestError::LoopsSendFailed { status, body })
            }
            Err(err) => Err(DigestError::LoopsRequest(err)),
        }
    }
}
