//! OAuth login flow, token refresh, and credential I/O.

use std::path::PathBuf;

use anyhow::{Context, bail};
use rand::{Rng, distr::Alphanumeric};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::{io::AsyncWriteExt, net::TcpListener};

// ── Credential storage ──────────────────────────────────────────────

/// Matches the format used by the local server's OAuthCredentials service.
#[derive(Serialize, Deserialize)]
struct StoredCredentials {
    refresh_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    remote_url: Option<String>,
}

fn credentials_path() -> PathBuf {
    directories::ProjectDirs::from("ai", "bloop", "vibe-kanban")
        .expect("failed to resolve data directory")
        .data_dir()
        .join("credentials.json")
}

pub fn load_credentials() -> anyhow::Result<(String, String)> {
    let path = credentials_path();
    let data = std::fs::read_to_string(&path).with_context(|| {
        format!(
            "No credentials found at {}. Run `login` first.",
            path.display()
        )
    })?;
    let creds: StoredCredentials =
        serde_json::from_str(&data).context("Failed to parse credentials file")?;
    let remote_url = creds
        .remote_url
        .context("No remote_url in credentials. Run `login` again.")?;
    Ok((creds.refresh_token, remote_url))
}

fn save_credentials(refresh_token: &str, remote_url: &str) -> anyhow::Result<()> {
    let path = credentials_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create directory {}", parent.display()))?;
    }
    let creds = StoredCredentials {
        refresh_token: refresh_token.to_string(),
        remote_url: Some(remote_url.to_string()),
    };
    let json = serde_json::to_string_pretty(&creds)?;
    std::fs::write(&path, json)
        .with_context(|| format!("Failed to write credentials to {}", path.display()))?;
    Ok(())
}

// ── PKCE helpers ────────────────────────────────────────────────────

fn generate_verifier() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(64)
        .map(char::from)
        .collect()
}

fn sha256_hex(input: &str) -> String {
    let digest = Sha256::digest(input.as_bytes());
    let mut output = String::with_capacity(64);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(output, "{byte:02x}");
    }
    output
}

// ── API types ───────────────────────────────────────────────────────

#[derive(Serialize)]
struct HandoffInitRequest {
    provider: String,
    return_to: String,
    app_challenge: String,
}

#[derive(Deserialize)]
struct HandoffInitResponse {
    handoff_id: String,
    authorize_url: String,
}

#[derive(Serialize)]
struct HandoffRedeemRequest {
    handoff_id: String,
    app_code: String,
    app_verifier: String,
}

#[derive(Deserialize)]
struct HandoffRedeemResponse {
    #[allow(dead_code)]
    access_token: String,
    refresh_token: String,
}

#[derive(Serialize)]
struct TokenRefreshRequest {
    refresh_token: String,
}

#[derive(Deserialize)]
pub struct TokenRefreshResponse {
    pub access_token: String,
    pub refresh_token: String,
}

// ── Login flow ──────────────────────────────────────────────────────

pub async fn login(remote_url: &str, provider: &str) -> anyhow::Result<()> {
    let remote_url = remote_url.trim_end_matches('/');
    let http = reqwest::Client::new();

    // 1. Bind temp callback listener
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let return_to = format!("http://localhost:{port}/callback");

    // 2. Generate PKCE verifier/challenge
    let app_verifier = generate_verifier();
    let app_challenge = sha256_hex(&app_verifier);

    // 3. Initiate handoff
    let init_resp: HandoffInitResponse = http
        .post(format!("{remote_url}/v1/oauth/web/init"))
        .json(&HandoffInitRequest {
            provider: provider.to_string(),
            return_to,
            app_challenge,
        })
        .send()
        .await
        .context("Failed to call handoff init")?
        .error_for_status()
        .context("Handoff init returned error")?
        .json()
        .await?;

    // 4. Open browser
    eprintln!("Opening browser for authentication...");
    if let Err(e) = open::that(&init_resp.authorize_url) {
        eprintln!("Failed to open browser: {e}");
        eprintln!(
            "Please open this URL manually:\n  {}",
            init_resp.authorize_url
        );
    }

    // 5. Wait for callback
    let (app_code, handoff_id) = wait_for_callback(listener).await?;

    if handoff_id != init_resp.handoff_id {
        bail!("Handoff ID mismatch in callback");
    }

    // 6. Redeem handoff
    let redeem_resp: HandoffRedeemResponse = http
        .post(format!("{remote_url}/v1/oauth/web/redeem"))
        .json(&HandoffRedeemRequest {
            handoff_id,
            app_code,
            app_verifier,
        })
        .send()
        .await
        .context("Failed to call handoff redeem")?
        .error_for_status()
        .context("Handoff redeem returned error")?
        .json()
        .await?;

    // 7. Save credentials
    save_credentials(&redeem_resp.refresh_token, remote_url)?;

    eprintln!("Login successful! Credentials saved.");
    Ok(())
}

/// Wait for the OAuth callback on the local TCP listener.
/// Expects `GET /callback?handoff_id=...&app_code=...`
async fn wait_for_callback(listener: TcpListener) -> anyhow::Result<(String, String)> {
    let (mut stream, _) = listener
        .accept()
        .await
        .context("Failed to accept callback connection")?;

    let mut buf = vec![0u8; 4096];
    let n = tokio::io::AsyncReadExt::read(&mut stream, &mut buf).await?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // Parse the request line: GET /callback?handoff_id=...&app_code=... HTTP/1.1
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .context("Invalid HTTP request")?;

    let query = path
        .split('?')
        .nth(1)
        .context("No query string in callback")?;
    let mut app_code = None;
    let mut handoff_id = None;
    let mut error = None;

    for pair in query.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            let value = urlencoding::decode(value)
                .unwrap_or_else(|_| value.into())
                .into_owned();
            match key {
                "app_code" => app_code = Some(value),
                "handoff_id" => handoff_id = Some(value),
                "error" => error = Some(value),
                _ => {}
            }
        }
    }

    // Send response to close the browser tab
    let html = if error.is_some() {
        "<html><body><h1>Login failed</h1><p>You can close this tab.</p></body></html>"
    } else {
        "<html><body><h1>Login successful!</h1><p>You can close this tab.</p></body></html>"
    };

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    stream.write_all(response.as_bytes()).await?;
    stream.shutdown().await?;

    if let Some(error) = error {
        bail!("OAuth error: {error}");
    }

    let app_code = app_code.context("Missing app_code in callback")?;
    let handoff_id = handoff_id.context("Missing handoff_id in callback")?;

    Ok((app_code, handoff_id))
}

// ── Token refresh ───────────────────────────────────────────────────

pub async fn refresh_token(
    remote_url: &str,
    refresh_token: &str,
) -> anyhow::Result<TokenRefreshResponse> {
    let remote_url = remote_url.trim_end_matches('/');
    let http = reqwest::Client::new();

    let resp: TokenRefreshResponse = http
        .post(format!("{remote_url}/v1/tokens/refresh"))
        .json(&TokenRefreshRequest {
            refresh_token: refresh_token.to_string(),
        })
        .send()
        .await
        .context("Failed to call token refresh")?
        .error_for_status()
        .context("Token refresh returned error (you may need to run `login` again)")?
        .json()
        .await?;

    // Save rotated refresh token
    save_credentials(&resp.refresh_token, remote_url)?;

    Ok(resp)
}
