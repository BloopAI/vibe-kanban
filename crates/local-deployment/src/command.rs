use command_group::AsyncGroupChild;
use services::services::container::ContainerError;

pub async fn kill_process_group(child: &mut AsyncGroupChild) -> Result<(), ContainerError> {
    utils::process::kill_process_group(child)
        .await
        .map_err(ContainerError::KillFailed)
}
