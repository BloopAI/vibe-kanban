use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    executors::{BaseCodingAgent, SlashCommandDescription},
    model_selector::ModelSelectorConfig,
};

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
#[ts(export)]
pub struct ExecutorDiscoveredOptions {
    pub model_selector: ModelSelectorConfig,
    pub slash_commands: Vec<SlashCommandDescription>,
    pub loading_models: bool,
    pub loading_agents: bool,
    pub loading_slash_commands: bool,
    pub error: Option<String>,
}

impl ExecutorDiscoveredOptions {
    pub fn with_loading(mut self, loading: bool) -> Self {
        self.loading_models = loading;
        self.loading_agents = loading;
        self.loading_slash_commands = loading;
        self
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ExecutorConfigCacheKey {
    pub path: Option<PathBuf>,
    pub cmd_key: String,
    pub base_executor: BaseCodingAgent,
}

impl ExecutorConfigCacheKey {
    pub fn new(path: Option<&PathBuf>, cmd_key: String, base_executor: BaseCodingAgent) -> Self {
        Self {
            path: path.cloned(),
            cmd_key,
            base_executor,
        }
    }
}
