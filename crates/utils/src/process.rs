use command_group::AsyncGroupChild;
#[cfg(unix)]
use tokio::time::Duration;

pub async fn kill_process_group(child: &mut AsyncGroupChild) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        // Use command_group's UnixChildExt::signal() which calls killpg()
        // with the pgid captured at spawn time. This works even after the
        // group leader has exited, unlike getpgid() which would fail.
        use command_group::{Signal, UnixChildExt};

        for sig in [Signal::SIGINT, Signal::SIGTERM, Signal::SIGKILL] {
            tracing::info!("Sending {:?} to process group", sig);
            if let Err(e) = child.signal(sig) {
                tracing::warn!("Failed to send signal {:?} to process group: {}", sig, e);
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
            if child.try_wait()?.is_some() {
                tracing::info!("Process group exited after {:?}", sig);
                break;
            }
        }
    }

    let _ = child.kill().await;
    let _ = child.wait().await;
    Ok(())
}
