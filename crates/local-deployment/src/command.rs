use command_group::AsyncGroupChild;
use services::services::container::ContainerError;

pub(crate) async fn kill_process_group(child: &mut AsyncGroupChild) -> Result<(), ContainerError> {
    utils::process::kill_process_group(child)
        .await
        .map_err(ContainerError::KillFailed)
}

pub(crate) async fn stop_transient_unit(unit_name: &str) -> Result<(), ContainerError> {
    let output = tokio::process::Command::new("systemctl")
        .arg("--user")
        .arg("stop")
        .arg(unit_name)
        .output()
        .await
        .map_err(ContainerError::Io)?;

    if output.status.success() {
        return Ok(());
    }

    Err(ContainerError::Other(anyhow::anyhow!(
        "systemctl stop {} failed: {}",
        unit_name,
        String::from_utf8_lossy(&output.stderr)
    )))
}
