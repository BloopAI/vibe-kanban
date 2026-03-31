use api_types::MemberRole;
use async_trait::async_trait;
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
    message::{Mailbox, MessageBuilder, header::ContentType},
    transport::smtp::authentication::Credentials,
};

use super::{DigestContact, DigestNotificationItem, Mailer};
use crate::digest::DigestError;

pub struct SmtpMailer {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

impl SmtpMailer {
    pub fn new(host: &str, port: u16, username: &str, password: &str, from: &str) -> Self {
        let credentials = Credentials::new(username.to_owned(), password.to_owned());

        let transport = if port == 465 {
            AsyncSmtpTransport::<Tokio1Executor>::relay(host)
                .expect("failed to create SMTP relay transport")
                .port(port)
                .credentials(credentials)
                .build()
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
                .expect("failed to create SMTP STARTTLS transport")
                .port(port)
                .credentials(credentials)
                .build()
        };

        let from: Mailbox = from.parse().expect("invalid SMTP_FROM address");

        Self { transport, from }
    }

    fn message_builder(&self, to: &str, subject: &str) -> Option<MessageBuilder> {
        let to_mailbox: Mailbox = match to.parse() {
            Ok(m) => m,
            Err(err) => {
                tracing::warn!(email = %to, error = ?err, "Invalid recipient address, skipping");
                return None;
            }
        };

        Some(
            lettre::Message::builder()
                .from(self.from.clone())
                .to(to_mailbox)
                .subject(subject),
        )
    }

    async fn send_html(&self, to: &str, subject: &str, html_body: String) {
        let Some(builder) = self.message_builder(to, subject) else {
            return;
        };

        let message = match builder.header(ContentType::TEXT_HTML).body(html_body) {
            Ok(m) => m,
            Err(err) => {
                tracing::error!(error = ?err, "Failed to build email message");
                return;
            }
        };

        match self.transport.send(message).await {
            Ok(_) => tracing::debug!("Email sent via SMTP to {to}"),
            Err(err) => tracing::error!(error = ?err, "SMTP send error to {to}"),
        }
    }
}

fn wrap_html(body: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px;">
{body}
</body>
</html>"#
    )
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[async_trait]
impl Mailer for SmtpMailer {
    async fn send_org_invitation(
        &self,
        org_name: &str,
        email: &str,
        accept_url: &str,
        role: MemberRole,
        invited_by: Option<&str>,
    ) {
        let role_str = match role {
            MemberRole::Admin => "an admin",
            MemberRole::Member => "a member",
        };
        let inviter = invited_by.unwrap_or("Someone");

        let html = wrap_html(&format!(
            r#"<h2>You're invited to {org}</h2>
<p>{inviter} invited you to join <strong>{org}</strong> as {role_str} on Vibe Kanban.</p>
<p><a href="{url}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Accept Invitation</a></p>
<p style="color:#666;font-size:13px;">Or copy this link: {url}</p>"#,
            org = esc(org_name),
            url = esc(accept_url),
            inviter = esc(inviter),
        ));

        self.send_html(
            email,
            &format!("You're invited to join {org_name} on Vibe Kanban"),
            html,
        )
        .await;
    }

    async fn send_review_ready(&self, email: &str, review_url: &str, pr_name: &str) {
        let html = wrap_html(&format!(
            r#"<h2>Review ready</h2>
<p>The review for <strong>{pr}</strong> is ready.</p>
<p><a href="{url}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">View Review</a></p>
<p style="color:#666;font-size:13px;">Or copy this link: {url}</p>"#,
            pr = esc(pr_name),
            url = esc(review_url),
        ));

        self.send_html(email, &format!("Review ready: {pr_name}"), html)
            .await;
    }

    async fn send_review_failed(&self, email: &str, pr_name: &str, review_id: &str) {
        let html = wrap_html(&format!(
            r#"<h2>Review failed</h2>
<p>The review for <strong>{pr}</strong> could not be completed.</p>
<p style="color:#666;font-size:13px;">Review ID: {id}</p>"#,
            pr = esc(pr_name),
            id = esc(review_id),
        ));

        self.send_html(email, &format!("Review failed: {pr_name}"), html)
            .await;
    }

    async fn send_digest_event(
        &self,
        contact: &DigestContact<'_>,
        notification_count: i32,
        items: &[DigestNotificationItem],
        notifications_url: &str,
    ) -> Result<(), DigestError> {
        let greeting = contact
            .first_name
            .map(|n| format!("Hi {},", esc(n)))
            .unwrap_or_else(|| "Hi,".to_string());

        let mut items_html = String::new();
        for item in items {
            items_html.push_str(&format!(
                r#"<li style="margin-bottom:8px;"><a href="{url}" style="color:#2563eb;text-decoration:none;font-weight:500;">{title}</a>{body}</li>"#,
                url = esc(&item.url),
                title = esc(&item.title),
                body = if item.body.is_empty() {
                    String::new()
                } else {
                    format!(r#"<br><span style="color:#666;font-size:13px;">{}</span>"#, esc(&item.body))
                },
            ));
        }

        let html = wrap_html(&format!(
            r#"<p>{greeting}</p>
<p>You have <strong>{count}</strong> new notification{s}.</p>
<ul style="padding-left:20px;">{items_html}</ul>
<p><a href="{url}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">View All Notifications</a></p>"#,
            count = notification_count,
            s = if notification_count == 1 { "" } else { "s" },
            url = esc(notifications_url),
        ));

        let Some(builder) = self.message_builder(
            contact.email,
            &format!("You have {notification_count} new notifications"),
        ) else {
            return Err(DigestError::Transport(format!(
                "invalid recipient address: {}",
                contact.email
            )));
        };

        let message = builder
            .header(ContentType::TEXT_HTML)
            .body(html)
            .map_err(|e| DigestError::Transport(e.to_string()))?;

        self.transport
            .send(message)
            .await
            .map_err(|e| DigestError::Transport(e.to_string()))?;

        tracing::debug!("Digest email sent via SMTP to {}", contact.email);
        Ok(())
    }
}
