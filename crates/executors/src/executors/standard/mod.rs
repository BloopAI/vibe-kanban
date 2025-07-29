use std::{path::PathBuf, str::FromStr};

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use enum_dispatch::enum_dispatch;
use serde::Serialize;

use crate::{
    executors::{
        ExecutorError,
        standard::{amp::AmpExecutor, gemini::GeminiExecutor},
    },
    logs::{LogNormalizers, amp::AmpLogNormalizer, gemini::GeminiLogNormalizer},
};

pub mod amp;
pub mod gemini;

#[enum_dispatch]
#[derive(Serialize)]
pub enum StandardCodingAgentExecutors {
    AmpExecutor,
    GeminiExecutor,
}

#[async_trait]
#[enum_dispatch(StandardCodingAgentExecutors)]
pub trait StandardCodingAgentExecutor {
    async fn spawn(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
    ) -> Result<AsyncGroupChild, ExecutorError>;
    async fn spawn_follow_up(
        &self,
        current_dir: &PathBuf,
        prompt: &str,
        session_id: &str,
    ) -> Result<AsyncGroupChild, ExecutorError>;
}

impl StandardCodingAgentExecutors {
    pub fn to_normalizer(&self) -> LogNormalizers {
        match self {
            StandardCodingAgentExecutors::AmpExecutor(_) => {
                LogNormalizers::AmpLogNormalizer(AmpLogNormalizer {})
            }
            StandardCodingAgentExecutors::GeminiExecutor(_) => {
                LogNormalizers::GeminiLogNormalizer(GeminiLogNormalizer::new())
            }
        }
    }
}

impl FromStr for StandardCodingAgentExecutors {
    type Err = ExecutorError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "amp" => Ok(StandardCodingAgentExecutors::AmpExecutor(AmpExecutor {})),
            "gemini" => Ok(StandardCodingAgentExecutors::GeminiExecutor(
                GeminiExecutor {},
            )),
            _ => Err(ExecutorError::UnknownExecutorType(s.to_string())),
        }
    }
}
