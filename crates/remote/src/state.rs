use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    activity::ActivityBroker,
    auth::{DeviceFlowService, JwtService},
    config::RemoteServerConfig,
    mail::Mailer,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub broker: ActivityBroker,
    pub config: RemoteServerConfig,
    pub jwt: Arc<JwtService>,
    pub device_flow: Arc<DeviceFlowService>,
    pub mailer: Arc<dyn Mailer>,
    pub base_url: String,
}

impl AppState {
    pub fn new(
        pool: PgPool,
        broker: ActivityBroker,
        config: RemoteServerConfig,
        jwt: Arc<JwtService>,
        device_flow: Arc<DeviceFlowService>,
        mailer: Arc<dyn Mailer>,
        base_url: String,
    ) -> Self {
        Self {
            pool,
            broker,
            config,
            jwt,
            device_flow,
            mailer,
            base_url,
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub fn broker(&self) -> &ActivityBroker {
        &self.broker
    }

    pub fn config(&self) -> &RemoteServerConfig {
        &self.config
    }

    pub fn jwt(&self) -> Arc<JwtService> {
        Arc::clone(&self.jwt)
    }

    pub fn device_flow(&self) -> Arc<DeviceFlowService> {
        Arc::clone(&self.device_flow)
    }
}
