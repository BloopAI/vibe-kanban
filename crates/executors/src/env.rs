use std::collections::HashMap;

use tokio::process::Command;

/// Environment variables to inject into executor processes
#[derive(Debug, Clone, Default)]
pub struct ExecutionEnv {
    pub vars: HashMap<String, String>,
}

impl ExecutionEnv {
    pub fn new() -> Self {
        Self {
            vars: HashMap::new(),
        }
    }

    /// Insert an environment variable
    pub fn insert(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.vars.insert(key.into(), value.into());
    }

    /// Apply all environment variables to a Command
    pub fn apply_to_command(&self, command: &mut Command) {
        for (key, value) in &self.vars {
            command.env(key, value);
        }
    }
}
