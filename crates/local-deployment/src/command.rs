use command_group::AsyncGroupChild;
#[cfg(unix)]
use nix::{
    sys::signal::{Signal, killpg},
    unistd::{Pid, getpgid},
};
use services::services::container::ContainerError;
use tokio::time::Duration;

pub async fn kill_process_group(child: &mut AsyncGroupChild) -> Result<(), ContainerError> {
    // hit the whole process group, not just the leader
    #[cfg(unix)]
    {
        if let Some(pid) = child.inner().id() {
            let pgid = getpgid(Some(Pid::from_raw(pid as i32)))
                .map_err(|e| ContainerError::KillFailed(std::io::Error::other(e)))?;

            for sig in [Signal::SIGINT, Signal::SIGTERM, Signal::SIGKILL] {
                if let Err(e) = killpg(pgid, sig) {
                    tracing::warn!(
                        "Failed to send signal {:?} to process group {}: {}",
                        sig,
                        pgid,
                        e
                    );
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
                if child
                    .inner()
                    .try_wait()
                    .map_err(|e| ContainerError::Io(e))?
                    .is_some()
                {
                    break; // gone!
                }
            }
        }
    }

    // final fallback – command_group already targets the group
    child
        .kill()
        .await
        .map_err(|e| ContainerError::KillFailed(e))?;
    child
        .wait()
        .await
        .map_err(|e| ContainerError::KillFailed(e))?; // reap

    Ok(())
}
