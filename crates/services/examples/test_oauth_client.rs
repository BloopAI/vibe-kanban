use std::time::{Duration, Instant};

use clap::Parser;
use services::services::remote_client::{DevicePollResult, RemoteClient};
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(
    name = "test-oauth-client",
    version,
    about = "Manual OAuth device-flow tester"
)]
struct Args {
    #[arg(long, default_value = "http://localhost:3000")]
    base_url: String,

    #[arg(long, default_value = "github")]
    provider: String,

    #[arg(long, default_value_t = 5)]
    poll_secs: u64,

    #[arg(long)]
    verbose_token: bool,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(false)
        .compact()
        .init();

    let args = Args::parse();
    info!("Base URL: {}, provider: {}", args.base_url, args.provider);

    let client = RemoteClient::new(&args.base_url)?;

    let init = match client.device_init(&args.provider).await {
        Ok(v) => v,
        Err(e) => {
            error!("device_init failed: {}", e);
            std::process::exit(1);
        }
    };

    let handoff_id = init.handoff_id;
    println!("\nPlease authenticate:");
    if let Some(uri_complete) = init.verification_uri_complete.as_deref() {
        println!("  Open this URL: {uri_complete}");
    } else {
        println!("  Visit: {}", init.verification_uri);
        println!("  Enter code: {}", init.user_code);
    }
    println!("Handoff ID: {handoff_id}\n");

    let started = Instant::now();
    loop {
        match client.device_poll(handoff_id).await {
            Ok(DevicePollResult::Pending) => {
                println!(
                    "Waiting for user authorization... elapsed {}s",
                    started.elapsed().as_secs()
                );
                tokio::time::sleep(Duration::from_secs(args.poll_secs)).await;
            }
            Ok(DevicePollResult::Success { access_token }) => {
                let display_token = if args.verbose_token {
                    access_token.clone()
                } else {
                    let len = access_token.len();
                    if len > 12 {
                        format!(
                            "{}…{}",
                            &access_token[..8],
                            &access_token[len.saturating_sub(4)..]
                        )
                    } else {
                        "***".to_string()
                    }
                };
                println!("\n✓ Success! Access token: {display_token}\n");

                match client.profile(&access_token).await {
                    Ok(profile) => {
                        println!("Profile:");
                        println!("  User ID: {}", profile.user_id);
                        println!("  Username: {:?}", profile.username);
                        println!("  Email: {}", profile.email);
                        println!("  Organization ID: {}", profile.organization_id);
                        if !profile.providers.is_empty() {
                            println!("  Providers:");
                            for provider in &profile.providers {
                                println!(
                                    "    - {} ({})",
                                    provider.provider,
                                    provider.username.as_deref().unwrap_or("no username")
                                );
                            }
                        }
                    }
                    Err(e) => {
                        error!("Fetching profile failed: {}", e);
                    }
                }
                break;
            }
            Ok(DevicePollResult::Error { code }) => {
                error!("Device flow error: {:?}", code);
                std::process::exit(2);
            }
            Err(e) => {
                if e.should_retry() {
                    eprintln!("Transient error: {e} (will retry)");
                    tokio::time::sleep(Duration::from_secs(args.poll_secs)).await;
                } else {
                    error!("Polling failed: {}", e);
                    std::process::exit(3);
                }
            }
        }
    }

    Ok(())
}
