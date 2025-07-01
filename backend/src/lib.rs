use rust_embed::RustEmbed;

pub mod app_state;
pub mod execution_monitor;
pub mod executor;
pub mod executors;
pub mod mcp;
pub mod models;
pub mod routes;
pub mod services;
pub mod utils;

#[derive(RustEmbed)]
#[folder = "../frontend/dist"]
pub struct Assets;

#[derive(RustEmbed)]
#[folder = "sounds"]
pub struct SoundAssets;

#[derive(RustEmbed)]
#[folder = "scripts"]
pub struct ScriptAssets;
