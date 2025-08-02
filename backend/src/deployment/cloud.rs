use async_trait::async_trait;

use crate::{command_runner::CommandRunner, deployment::Deployment};

#[derive(Clone)]
pub struct CloudDeployment {}

#[async_trait]
impl Deployment for CloudDeployment {
    fn new() -> Self {
        Self {}
    }

    fn name(&self) -> &str {
        "cloud"
    }

    fn command_runner(&self) -> CommandRunner {
        CommandRunner::new_cloud()
    }
}
