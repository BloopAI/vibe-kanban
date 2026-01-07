mod api;
mod archive;
mod claude_session;
mod config;
mod error;
mod github;
mod session_selector;

use std::time::Duration;

use anyhow::Result;
use api::{ReviewApiClient, ReviewStatus, StartRequest};
use clap::Parser;
use error::ReviewError;
use github::{checkout_commit, clone_repo, get_pr_info, parse_pr_url};
use indicatif::{ProgressBar, ProgressStyle};
use tempfile::TempDir;
use tracing::debug;
use tracing_subscriber::EnvFilter;

const DEFAULT_API_URL: &str = "https://api.vibekanban.com";
const POLL_INTERVAL: Duration = Duration::from_secs(10);
const TIMEOUT: Duration = Duration::from_secs(600); // 10 minutes

const BANNER: &str = r#"
██████╗ ███████╗██╗   ██╗██╗███████╗██╗    ██╗   ███████╗ █████╗ ███████╗████████╗
██╔══██╗██╔════╝██║   ██║██║██╔════╝██║    ██║   ██╔════╝██╔══██╗██╔════╝╚══██╔══╝
██████╔╝█████╗  ██║   ██║██║█████╗  ██║ █╗ ██║   █████╗  ███████║███████╗   ██║   
██╔══██╗██╔══╝  ╚██╗ ██╔╝██║██╔══╝  ██║███╗██║   ██╔══╝  ██╔══██║╚════██║   ██║   
██║  ██║███████╗ ╚████╔╝ ██║███████╗╚███╔███╔╝██╗██║     ██║  ██║███████║   ██║   
╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝   ╚═╝   

"#;

#[derive(Parser, Debug)]
#[command(name = "review")]
#[command(
    about = "Vibe-Kanban Review helps you review GitHub pull requests by turning them into a clear, story-driven summary instead of a wall of diffs. You provide a pull request URL, optionally link a Claude Code project for additional context, and it builds a narrative that highlights key events and important decisions, helping you prioritise what actually needs attention. It's particularly useful when reviewing large amounts of AI-generated code. Note that code is uploaded to and processed on Vibe-Kanban servers using AI."
)]
#[command(version)]
struct Args {
    /// GitHub PR URL (e.g., https://github.com/owner/repo/pull/123)
    pr_url: String,

    /// Enable verbose output
    #[arg(short, long, default_value_t = false)]
    verbose: bool,

    /// API base URL
    #[arg(long, env = "REVIEW_API_URL", default_value = DEFAULT_API_URL)]
    api_url: String,
}

fn show_disclaimer() {
    println!();
    println!(
        "DISCLAIMER: Your code will be processed on our secure remote servers, all artefacts (code, AI logs, etc...) will be deleted after 14 days."
    );
    println!();
    println!("Full terms and conditions and privacy policy: https://review.fast/terms");
    println!();
    println!("Press Enter to accept and continue...");

    let mut input = String::new();
    std::io::stdin().read_line(&mut input).ok();
}

fn prompt_email(config: &mut config::Config) -> String {
    use dialoguer::Input;

    let mut input: Input<String> =
        Input::new().with_prompt("Email address (we'll send a link to the review here, no spam)");

    if let Some(ref saved_email) = config.email {
        input = input.default(saved_email.clone());
    }

    let email: String = input.interact_text().expect("Failed to read email");

    // Save email for next time
    config.email = Some(email.clone());
    if let Err(e) = config.save() {
        debug!("Failed to save config: {}", e);
    }

    email
}

fn create_spinner(message: &str) -> ProgressBar {
    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .template("{spinner:.green} {msg}")
            .expect("Invalid spinner template"),
    );
    spinner.set_message(message.to_string());
    spinner.enable_steady_tick(Duration::from_millis(100));
    spinner
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // Initialize tracing
    let filter = if args.verbose {
        EnvFilter::new("debug")
    } else {
        EnvFilter::new("warn")
    };
    tracing_subscriber::fmt().with_env_filter(filter).init();

    println!("{}", BANNER);

    show_disclaimer();

    debug!("Args: {:?}", args);

    // Run the main flow and handle errors
    if let Err(e) = run(args).await {
        eprintln!("Error: {e}");
        std::process::exit(1);
    }

    Ok(())
}

async fn run(args: Args) -> Result<(), ReviewError> {
    // 1. Load config and prompt for email
    let mut config = config::Config::load();
    let email = prompt_email(&mut config);

    // 2. Parse PR URL
    let spinner = create_spinner("Parsing PR URL...");
    let (owner, repo, pr_number) = parse_pr_url(&args.pr_url)?;
    spinner.finish_with_message(format!("PR: {owner}/{repo}#{pr_number}"));

    // 3. Get PR info
    let spinner = create_spinner("Fetching PR information...");
    let pr_info = get_pr_info(&owner, &repo, pr_number)?;
    spinner.finish_with_message(format!("PR: {}", pr_info.title));

    // 4. Select Claude Code session (optional)
    let session_files = match session_selector::select_session(&pr_info.head_ref_name) {
        Ok(session_selector::SessionSelection::Selected(files)) => {
            println!("  Selected {} session file(s)", files.len());
            Some(files)
        }
        Ok(session_selector::SessionSelection::Skipped) => {
            println!("  Skipping project attachment");
            None
        }
        Err(e) => {
            debug!("Session selection error: {}", e);
            println!("  No sessions found");
            None
        }
    };

    // 5. Clone repository to temp directory
    let temp_dir = TempDir::new().map_err(|e| ReviewError::CloneFailed(e.to_string()))?;
    let repo_dir = temp_dir.path().join(&repo);

    let spinner = create_spinner("Cloning repository...");
    clone_repo(&owner, &repo, &repo_dir)?;
    spinner.finish_with_message("Repository cloned");

    // 6. Checkout PR head commit
    let spinner = create_spinner("Checking out PR...");
    checkout_commit(&pr_info.head_commit, &repo_dir)?;
    spinner.finish_with_message("PR checked out");

    // 7. Create tarball (with optional session data)
    let spinner = create_spinner("Creating archive...");

    // If sessions were selected, write .agent-messages.json to repo root
    if let Some(ref files) = session_files {
        let json_content = claude_session::concatenate_sessions_to_json(files)?;
        let agent_messages_path = repo_dir.join(".agent-messages.json");
        std::fs::write(&agent_messages_path, json_content)
            .map_err(|e| ReviewError::ArchiveFailed(e.to_string()))?;
    }

    let payload = archive::create_tarball(&repo_dir)?;
    let size_mb = payload.len() as f64 / 1_048_576.0;
    spinner.finish_with_message(format!("Archive created ({size_mb:.2} MB)"));

    // 8. Initialize review
    let client = ReviewApiClient::new(args.api_url.clone());
    let spinner = create_spinner("Initializing review...");
    let init_response = client.init(&args.pr_url, &email, &pr_info.title).await?;
    spinner.finish_with_message(format!("Review ID: {}", init_response.review_id));

    // 9. Upload archive
    let spinner = create_spinner("Uploading archive...");
    client.upload(&init_response.upload_url, payload).await?;
    spinner.finish_with_message("Upload complete");

    // 10. Start review
    let spinner = create_spinner("Starting review...");
    let codebase_url = format!("r2://{}", init_response.object_key);
    client
        .start(StartRequest {
            id: init_response.review_id.to_string(),
            title: pr_info.title,
            description: pr_info.description,
            org: pr_info.owner,
            repo: pr_info.repo,
            codebase_url,
            base_commit: pr_info.base_commit,
        })
        .await?;
    spinner.finish_with_message(format!("Review started, we'll send you an email at {} when the review is ready. This can take a few minutes, you may now close the terminal", email));

    // 11. Poll for completion
    let spinner = create_spinner("Review in progress...");
    let start_time = std::time::Instant::now();

    loop {
        tokio::time::sleep(POLL_INTERVAL).await;

        // Check for timeout
        if start_time.elapsed() > TIMEOUT {
            spinner.finish_with_message("Timed out");
            return Err(ReviewError::Timeout);
        }

        let status = client
            .poll_status(&init_response.review_id.to_string())
            .await?;

        match status.status {
            ReviewStatus::Completed => {
                spinner.finish_with_message("Review completed!");
                break;
            }
            ReviewStatus::Failed => {
                spinner.finish_with_message("Review failed");
                let error_msg = status.error.unwrap_or_else(|| "Unknown error".to_string());
                return Err(ReviewError::ReviewFailed(error_msg));
            }
            _ => {
                let progress = status.progress.unwrap_or_else(|| status.status.to_string());
                spinner.set_message(format!("Review in progress: {progress}"));
            }
        }
    }

    // 12. Print result URL
    let review_url = client.review_url(&init_response.review_id.to_string());
    println!("\nReview available at:");
    println!("  {review_url}");

    Ok(())
}
