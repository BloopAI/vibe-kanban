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
                match e.raw_os_error() {
                    // Group no longer exists — already exited, nothing to do.
                    Some(code) if code == nix::libc::ESRCH => break,
                    // macOS returns EPERM when signaling a group whose leader
                    // has already reaped; treat as "already gone".
                    Some(code) if code == nix::libc::EPERM => {
                        tracing::debug!(
                            "Signal {:?} rejected with EPERM; process group already gone",
                            sig
                        );
                        break;
                    }
                    _ => tracing::warn!("Failed to send signal {:?} to process group: {}", sig, e),
                }
            }
            if sig != Signal::SIGKILL {
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }

    let _ = child.kill().await;
    let _ = child.wait().await;
    Ok(())
}
