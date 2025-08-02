use async_trait::async_trait;

use crate::{command_runner::CommandRunner, deployment::Deployment};

#[derive(Clone)]
pub struct LocalDeployment {}

#[async_trait]
impl Deployment for LocalDeployment {
    fn new() -> Self {
        Self {}
    }

    fn name(&self) -> &str {
        "local"
    }

    fn command_runner(&self) -> CommandRunner {
        CommandRunner::new_local()
    }
}
