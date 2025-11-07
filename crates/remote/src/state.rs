use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    activity::ActivityBroker,
    auth::{DeviceFlowService, JwtService},
    config::RemoteServerConfig,
};

#[derive(Clone)]
pub struct AppState {
    pool: PgPool,
    broker: ActivityBroker,
    config: RemoteServerConfig,
    jwt: Arc<JwtService>,
    device_flow: Arc<DeviceFlowService>,
}

impl AppState {
    pub fn new(
        pool: PgPool,
        broker: ActivityBroker,
        config: RemoteServerConfig,
        jwt: Arc<JwtService>,
        device_flow: Arc<DeviceFlowService>,
    ) -> Self {
        Self {
            pool,
            broker,
            config,
            jwt,
            device_flow,
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
