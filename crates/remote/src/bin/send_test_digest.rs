use std::{env, process::ExitCode};

use api_types::{NotificationPayload, NotificationType};
use chrono::{Duration, Utc};
use remote::{
    db::digest::NotificationDigestRow,
    digest::email,
    mail::{DigestContact, LoopsMailer, Mailer},
};
use sqlx::types::Json;
use uuid::Uuid;

#[tokio::main]
async fn main() -> ExitCode {
    remote::init_tracing();

    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> anyhow::Result<()> {
    let to_email = required_env("TEST_DIGEST_TO_EMAIL")?;
    let base_url = env::var("TEST_DIGEST_BASE_URL")
        .or_else(|_| env::var("SERVER_PUBLIC_BASE_URL"))
        .unwrap_or_else(|_| "http://localhost:5173".to_string());
    let first_name = env::var("TEST_DIGEST_FIRST_NAME").unwrap_or_else(|_| "Alex".to_string());
    let last_name = env::var("TEST_DIGEST_LAST_NAME").ok();
    let user_id = env::var("TEST_DIGEST_USER_ID").unwrap_or_else(|_| Uuid::new_v4().to_string());
    let notification_count = env::var("TEST_DIGEST_NOTIFICATION_COUNT")
        .ok()
        .and_then(|value| value.parse::<i32>().ok())
        .unwrap_or(12);
    let api_key = required_env("LOOPS_EMAIL_API_KEY")?;

    let rows = sample_rows();
    let items = email::build_digest_items(&rows, &base_url);
    let deeplink = email::notifications_url(&base_url);

    println!("Sending test digest to {to_email}");
    println!("User ID: {user_id}");
    println!("First name: {first_name}");
    println!("Last name: {last_name:?}");
    println!("Notification count: {notification_count}");
    println!("Base URL: {base_url}");
    println!("Notifications deeplink: {deeplink}");
    println!("Items: {items:#?}");

    let contact = DigestContact {
        email: &to_email,
        user_id: &user_id,
        first_name: Some(&first_name),
        last_name: last_name.as_deref(),
    };

    let mailer = LoopsMailer::new(api_key);
    mailer
        .send_digest_event(&contact, notification_count, &items, &deeplink)
        .await?;

    println!("Test digest event fired.");

    Ok(())
}

fn required_env(name: &str) -> anyhow::Result<String> {
    env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("{name} must be set"))
}

fn sample_rows() -> Vec<NotificationDigestRow> {
    let now = Utc::now();
    let issue_one = Uuid::new_v4();
    let issue_two = Uuid::new_v4();
    let issue_three = Uuid::new_v4();
    let project_id = Uuid::new_v4();

    vec![
        NotificationDigestRow {
            id: Uuid::new_v4(),
            notification_type: NotificationType::IssueCommentAdded,
            payload: Json(NotificationPayload {
                deeplink_path: Some(format!("/projects/{project_id}/issues/{issue_one}")),
                issue_id: Some(issue_one),
                issue_simple_id: Some("VK-42".to_string()),
                issue_title: Some("Alex needs to lock in immediately".to_string()),
                actor_user_id: Some(Uuid::new_v4()),
                comment_preview: Some(
                    "Alex, this is your official lock-in notice. No more excuses. The team is waiting on you and the deadline is tomorrow. Lock in or get locked out."
                        .to_string(),
                ),
                ..NotificationPayload::default()
            }),
            issue_id: Some(issue_one),
            created_at: now,
            actor_name: "Gabriel".to_string(),
        },
        NotificationDigestRow {
            id: Uuid::new_v4(),
            notification_type: NotificationType::IssueStatusChanged,
            payload: Json(NotificationPayload {
                deeplink_path: Some(format!("/projects/{project_id}/issues/{issue_two}")),
                issue_id: Some(issue_two),
                issue_simple_id: Some("VK-99".to_string()),
                issue_title: Some("Ensure Alex locks in before end of week".to_string()),
                actor_user_id: Some(Uuid::new_v4()),
                old_status_name: Some("Waiting on Alex to lock in".to_string()),
                new_status_name: Some("Alex still hasn't locked in".to_string()),
                ..NotificationPayload::default()
            }),
            issue_id: Some(issue_two),
            created_at: now - Duration::minutes(7),
            actor_name: "Louis".to_string(),
        },
        NotificationDigestRow {
            id: Uuid::new_v4(),
            notification_type: NotificationType::IssuePriorityChanged,
            payload: Json(NotificationPayload {
                deeplink_path: Some(format!("/projects/{project_id}/issues/{issue_three}")),
                issue_id: Some(issue_three),
                issue_simple_id: Some("VK-77".to_string()),
                issue_title: Some("Alex lock-in enforcement protocol".to_string()),
                actor_user_id: Some(Uuid::new_v4()),
                old_priority: Some(api_types::IssuePriority::Low),
                new_priority: Some(api_types::IssuePriority::Urgent),
                ..NotificationPayload::default()
            }),
            issue_id: Some(issue_three),
            created_at: now - Duration::minutes(14),
            actor_name: "Solomon".to_string(),
        },
        NotificationDigestRow {
            id: Uuid::new_v4(),
            notification_type: NotificationType::IssueTitleChanged,
            payload: Json(NotificationPayload {
                deeplink_path: Some(format!("/projects/{project_id}/issues/{issue_one}")),
                issue_id: Some(issue_one),
                issue_simple_id: Some("VK-42".to_string()),
                issue_title: Some("Alex needs to lock in immediately".to_string()),
                actor_user_id: Some(Uuid::new_v4()),
                new_title: Some("CRITICAL: Alex must lock in right now".to_string()),
                ..NotificationPayload::default()
            }),
            issue_id: Some(issue_one),
            created_at: now - Duration::minutes(19),
            actor_name: "Gabriel".to_string(),
        },
        NotificationDigestRow {
            id: Uuid::new_v4(),
            notification_type: NotificationType::IssueCommentReaction,
            payload: Json(NotificationPayload {
                deeplink_path: Some(format!("/projects/{project_id}/issues/{issue_two}")),
                issue_id: Some(issue_two),
                issue_simple_id: Some("VK-99".to_string()),
                issue_title: Some("Ensure Alex locks in before end of week".to_string()),
                actor_user_id: Some(Uuid::new_v4()),
                emoji: Some("🔒".to_string()),
                ..NotificationPayload::default()
            }),
            issue_id: Some(issue_two),
            created_at: now - Duration::minutes(27),
            actor_name: "Solomon".to_string(),
        },
        NotificationDigestRow {
            id: Uuid::new_v4(),
            notification_type: NotificationType::IssueDescriptionChanged,
            payload: Json(NotificationPayload {
                deeplink_path: Some(format!("/projects/{project_id}/issues/{issue_three}")),
                issue_id: Some(issue_three),
                issue_simple_id: Some("VK-77".to_string()),
                issue_title: Some("Alex lock-in enforcement protocol".to_string()),
                actor_user_id: Some(Uuid::new_v4()),
                ..NotificationPayload::default()
            }),
            issue_id: Some(issue_three),
            created_at: now - Duration::minutes(35),
            actor_name: "Louis".to_string(),
        },
    ]
}
