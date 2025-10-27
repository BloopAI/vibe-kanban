use db::models::task::TaskStatus;
use remote::db::tasks::TaskStatus as RemoteTaskStatus;

pub(super) fn to_remote(status: &TaskStatus) -> RemoteTaskStatus {
    match status {
        TaskStatus::Todo => RemoteTaskStatus::Todo,
        TaskStatus::InProgress => RemoteTaskStatus::InProgress,
        TaskStatus::InReview => RemoteTaskStatus::InReview,
        TaskStatus::Done => RemoteTaskStatus::Done,
        TaskStatus::Cancelled => RemoteTaskStatus::Cancelled,
    }
}

pub(super) fn from_remote(status: &RemoteTaskStatus) -> TaskStatus {
    match status {
        RemoteTaskStatus::Todo => TaskStatus::Todo,
        RemoteTaskStatus::InProgress => TaskStatus::InProgress,
        RemoteTaskStatus::InReview => TaskStatus::InReview,
        RemoteTaskStatus::Done => TaskStatus::Done,
        RemoteTaskStatus::Cancelled => TaskStatus::Cancelled,
    }
}
