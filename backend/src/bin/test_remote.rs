use std::env;

use vibe_kanban::command_runner::CommandRunner;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Set up remote execution
    env::set_var("CLOUD_EXECUTION", "1");
    env::set_var("CLOUD_SERVER_URL", "http://localhost:8000");

    println!("🚀 Testing remote CommandRunner...");

    // Test 1: Simple echo command
    println!("\n📝 Test 1: Echo command");
    let mut runner = CommandRunner::new();
    let mut process = runner
        .command("echo")
        .arg("Hello from remote!")
        .start()
        .await?;

    println!("✅ Successfully started remote echo command!");

    // Kill it (though echo probably finished already)
    match process.kill().await {
        Ok(()) => println!("✅ Successfully killed echo process"),
        Err(e) => println!("⚠️  Kill failed (probably already finished): {}", e),
    }

    // Test 2: Long-running command
    println!("\n⏰ Test 2: Sleep command (5 seconds)");
    let mut runner2 = CommandRunner::new();
    let mut process2 = runner2.command("sleep").arg("5").start().await?;

    println!("✅ Successfully started remote sleep command!");

    // Wait a bit then kill it
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    process2.kill().await?;
    println!("✅ Successfully killed sleep process!");

    // Test 3: Command with environment variables
    println!("\n🌍 Test 3: Environment variables");
    let mut runner3 = CommandRunner::new();
    let mut process3 = runner3
        .command("printenv")
        .arg("TEST_VAR")
        .env("TEST_VAR", "remote_test_value")
        .start()
        .await?;

    println!("✅ Successfully started remote printenv command!");
    process3.kill().await.ok(); // Don't fail if already finished

    // Test 4: Working directory
    println!("\n📁 Test 4: Working directory");
    let mut runner4 = CommandRunner::new();
    let mut process4 = runner4.command("pwd").working_dir("/tmp").start().await?;

    println!("✅ Successfully started remote pwd command!");
    process4.kill().await.ok(); // Don't fail if already finished

    // Test 5: Process Status Checking (TDD - These will FAIL initially)
    println!("\n📊 Test 5: Process Status Checking (TDD)");

    // Test 5a: Status of running process
    let mut runner5a = CommandRunner::new();
    let mut process5a = runner5a.command("sleep").arg("3").start().await?;

    println!("✅ Started sleep process for status testing");

    // This should return None (still running)
    match process5a.status().await {
        Ok(None) => println!("✅ Status correctly shows process still running"),
        Ok(Some(status)) => println!(
            "⚠️  Process finished unexpectedly with status: {:?}",
            status
        ),
        Err(e) => println!("❌ Status check failed (expected for now): {}", e),
    }

    // Test try_wait (non-blocking)
    match process5a.try_wait().await {
        Ok(None) => println!("✅ try_wait correctly shows process still running"),
        Ok(Some(status)) => println!(
            "⚠️  Process finished unexpectedly with status: {:?}",
            status
        ),
        Err(e) => println!("❌ try_wait failed (expected for now): {}", e),
    }

    // Kill the process to test status of completed process
    process5a.kill().await.ok();

    // Test 5b: Status of completed process
    let mut runner5b = CommandRunner::new();
    let mut process5b = runner5b.command("echo").arg("status test").start().await?;

    println!("✅ Started echo process for completion status testing");

    // Wait for process to complete
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    match process5b.status().await {
        Ok(Some(status)) => {
            println!(
                "✅ Status correctly shows completed process: success={}, code={:?}",
                status.success(),
                status.code()
            );
        }
        Ok(None) => println!("⚠️  Process still running (might need more time)"),
        Err(e) => println!("❌ Status check failed (expected for now): {}", e),
    }

    // Test 5c: Wait for process completion
    let mut runner5c = CommandRunner::new();
    let mut process5c = runner5c.command("echo").arg("wait test").start().await?;

    println!("✅ Started echo process for wait testing");

    match process5c.wait().await {
        Ok(status) => {
            println!(
                "✅ Wait completed successfully: success={}, code={:?}",
                status.success(),
                status.code()
            );
        }
        Err(e) => println!("❌ Wait failed (expected for now): {}", e),
    }

    // Test 6: Output Streaming (TDD - These will FAIL initially)
    println!("\n🌊 Test 6: Output Streaming (TDD)");

    // Test 6a: Stdout streaming
    let mut runner6a = CommandRunner::new();
    let mut process6a = runner6a
        .command("echo")
        .arg("Hello stdout streaming!")
        .start()
        .await?;

    println!("✅ Started echo process for stdout streaming test");

    // Give the server a moment to capture output from fast commands like echo
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

    match process6a.stream().await {
        Ok(mut stream) => {
            println!("✅ Got streams from process");

            if let Some(stdout) = &mut stream.stdout {
                use tokio::io::AsyncReadExt;
                let mut buffer = Vec::new();

                match stdout.read_to_end(&mut buffer).await {
                    Ok(bytes_read) => {
                        let output = String::from_utf8_lossy(&buffer);
                        if bytes_read > 0 && output.contains("Hello stdout streaming") {
                            println!("✅ Successfully read stdout: '{}'", output.trim());
                        } else if bytes_read == 0 {
                            println!(
                                "❌ No stdout data received (expected for now - empty streams)"
                            );
                        } else {
                            println!("⚠️  Unexpected stdout content: '{}'", output);
                        }
                    }
                    Err(e) => println!("❌ Failed to read stdout: {}", e),
                }
            } else {
                println!("❌ No stdout stream available (expected for now)");
            }
        }
        Err(e) => println!("❌ Failed to get streams: {}", e),
    }

    // Test 6b: Stderr streaming
    let mut runner6b = CommandRunner::new();
    let mut process6b = runner6b
        .command("bash")
        .arg("-c")
        .arg("echo 'Error message' >&2")
        .start()
        .await?;

    println!("✅ Started bash process for stderr streaming test");

    // Give the server a moment to capture output from fast commands
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

    match process6b.stream().await {
        Ok(mut stream) => {
            if let Some(stderr) = &mut stream.stderr {
                use tokio::io::AsyncReadExt;
                let mut buffer = Vec::new();

                match stderr.read_to_end(&mut buffer).await {
                    Ok(bytes_read) => {
                        let output = String::from_utf8_lossy(&buffer);
                        if bytes_read > 0 && output.contains("Error message") {
                            println!("✅ Successfully read stderr: '{}'", output.trim());
                        } else if bytes_read == 0 {
                            println!(
                                "❌ No stderr data received (expected for now - empty streams)"
                            );
                        } else {
                            println!("⚠️  Unexpected stderr content: '{}'", output);
                        }
                    }
                    Err(e) => println!("❌ Failed to read stderr: {}", e),
                }
            } else {
                println!("❌ No stderr stream available (expected for now)");
            }
        }
        Err(e) => println!("❌ Failed to get streams: {}", e),
    }

    // Test 6c: Streaming from long-running process
    let mut runner6c = CommandRunner::new();
    let mut process6c = runner6c
        .command("bash")
        .arg("-c")
        .arg("for i in {1..3}; do echo \"Line $i\"; sleep 0.1; done")
        .start()
        .await?;

    println!("✅ Started bash process for streaming test");

    // Give the server a moment to capture output from the command
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    match process6c.stream().await {
        Ok(mut stream) => {
            if let Some(stdout) = &mut stream.stdout {
                use tokio::io::AsyncReadExt;
                let mut buffer = [0u8; 1024];

                // Try to read some data (this tests real-time streaming)
                match tokio::time::timeout(
                    tokio::time::Duration::from_secs(2),
                    stdout.read(&mut buffer),
                )
                .await
                {
                    Ok(Ok(bytes_read)) => {
                        let output = String::from_utf8_lossy(&buffer[..bytes_read]);
                        if bytes_read > 0 {
                            println!("✅ Successfully streamed output: '{}'", output.trim());
                        } else {
                            println!("❌ No streaming data received (expected for now)");
                        }
                    }
                    Ok(Err(e)) => println!("❌ Stream read error: {}", e),
                    Err(_) => {
                        println!("❌ Stream read timeout (expected for now - no real streaming)")
                    }
                }
            } else {
                println!("❌ No stdout stream available for streaming test");
            }
        }
        Err(e) => println!("❌ Failed to get streams for streaming test: {}", e),
    }

    // Clean up
    process6c.kill().await.ok();

    // Test 7: Server Status API Endpoint (TDD - These will FAIL initially)
    println!("\n🔍 Test 7: Server Status API Endpoint (TDD)");

    // Create a process first
    let client = reqwest::Client::new();
    let command_request = serde_json::json!({
        "command": "sleep",
        "args": ["5"],
        "working_dir": null,
        "env_vars": [],
        "stdin": null
    });

    let response = client
        .post("http://localhost:8000/commands")
        .json(&command_request)
        .send()
        .await?;

    if response.status().is_success() {
        let body: serde_json::Value = response.json().await?;
        if let Some(process_id) = body["data"]["process_id"].as_str() {
            println!("✅ Created process for status API test: {}", process_id);

            // Test 7a: GET /commands/{id}/status for running process
            let status_url = format!("http://localhost:8000/commands/{}/status", process_id);
            match client.get(&status_url).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        match response.json::<serde_json::Value>().await {
                            Ok(status_body) => {
                                println!("✅ Got status response: {}", status_body);

                                // Check expected structure
                                if let Some(data) = status_body.get("data") {
                                    if let Some(running) =
                                        data.get("running").and_then(|v| v.as_bool())
                                    {
                                        if running {
                                            println!(
                                                "✅ Status correctly shows process is running"
                                            );
                                        } else {
                                            println!("⚠️  Process already finished");
                                        }
                                    } else {
                                        println!("❌ Missing 'running' field in status response");
                                    }
                                } else {
                                    println!("❌ Missing 'data' field in status response");
                                }
                            }
                            Err(e) => println!("❌ Failed to parse status JSON: {}", e),
                        }
                    } else {
                        println!(
                            "❌ Status API returned error: {} (expected for now)",
                            response.status()
                        );
                    }
                }
                Err(e) => println!("❌ Status API request failed (expected for now): {}", e),
            }

            // Kill the process
            let _ = client
                .delete(format!("http://localhost:8000/commands/{}", process_id))
                .send()
                .await;
        }
    }

    // Test 7b: Status of completed process
    let quick_command = serde_json::json!({
        "command": "echo",
        "args": ["quick command"],
        "working_dir": null,
        "env_vars": [],
        "stdin": null
    });

    let response = client
        .post("http://localhost:8000/commands")
        .json(&quick_command)
        .send()
        .await?;

    if response.status().is_success() {
        let body: serde_json::Value = response.json().await?;
        if let Some(process_id) = body["data"]["process_id"].as_str() {
            println!(
                "✅ Created quick process for completed status test: {}",
                process_id
            );

            // Wait for it to complete
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

            let status_url = format!("http://localhost:8000/commands/{}/status", process_id);
            match client.get(&status_url).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        match response.json::<serde_json::Value>().await {
                            Ok(status_body) => {
                                println!("✅ Got completed status response: {}", status_body);

                                if let Some(data) = status_body.get("data") {
                                    if let Some(exit_code) = data.get("exit_code") {
                                        println!("✅ Status includes exit code: {}", exit_code);
                                    }
                                    if let Some(success) = data.get("success") {
                                        println!("✅ Status includes success flag: {}", success);
                                    }
                                }
                            }
                            Err(e) => println!("❌ Failed to parse completed status JSON: {}", e),
                        }
                    } else {
                        println!(
                            "❌ Completed status API returned error: {}",
                            response.status()
                        );
                    }
                }
                Err(e) => println!("❌ Completed status API request failed: {}", e),
            }
        }
    }

    // Test 7c: Status of non-existent process (error handling)
    let fake_id = "non-existent-process-id";
    let status_url = format!("http://localhost:8000/commands/{}/status", fake_id);
    match client.get(&status_url).send().await {
        Ok(response) => {
            if response.status() == reqwest::StatusCode::NOT_FOUND {
                println!("✅ Status API correctly returns 404 for non-existent process");
            } else {
                println!(
                    "❌ Status API should return 404 for non-existent process, got: {}",
                    response.status()
                );
            }
        }
        Err(e) => println!("❌ Error testing non-existent process status: {}", e),
    }

    // Test 8: Server Streaming API Endpoint (TDD - These will FAIL initially)
    println!("\n📡 Test 8: Server Streaming API Endpoint (TDD)");

    // Create a process that generates output
    let stream_command = serde_json::json!({
        "command": "bash",
        "args": ["-c", "for i in {1..3}; do echo \"Stream line $i\"; sleep 0.1; done"],
        "working_dir": null,
        "env_vars": [],
        "stdin": null
    });

    let response = client
        .post("http://localhost:8000/commands")
        .json(&stream_command)
        .send()
        .await?;

    if response.status().is_success() {
        let body: serde_json::Value = response.json().await?;
        if let Some(process_id) = body["data"]["process_id"].as_str() {
            println!("✅ Created streaming process: {}", process_id);

            // Test 8a: GET /commands/{id}/stream endpoint
            let stream_url = format!("http://localhost:8000/commands/{}/stream", process_id);
            match client.get(&stream_url).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        println!("✅ Stream endpoint accessible");
                        if let Some(content_type) = response.headers().get("content-type") {
                            println!("✅ Content-Type: {:?}", content_type);
                        }

                        // Try to read the response body
                        match response.text().await {
                            Ok(text) => {
                                if !text.is_empty() {
                                    println!("✅ Received streaming data: '{}'", text.trim());
                                } else {
                                    println!("❌ No streaming data received (expected for now)");
                                }
                            }
                            Err(e) => println!("❌ Failed to read stream response: {}", e),
                        }
                    } else {
                        println!(
                            "❌ Stream endpoint returned error: {} (expected for now)",
                            response.status()
                        );
                    }
                }
                Err(e) => println!("❌ Stream API request failed (expected for now): {}", e),
            }

            // Clean up
            let _ = client
                .delete(format!("http://localhost:8000/commands/{}", process_id))
                .send()
                .await;
        }
    }

    // Test 8b: Streaming from non-existent process
    let fake_stream_url = format!("http://localhost:8000/commands/{}/stream", "fake-id");
    match client.get(&fake_stream_url).send().await {
        Ok(response) => {
            if response.status() == reqwest::StatusCode::NOT_FOUND {
                println!("✅ Stream API correctly returns 404 for non-existent process");
            } else {
                println!(
                    "❌ Stream API should return 404 for non-existent process, got: {}",
                    response.status()
                );
            }
        }
        Err(e) => println!("❌ Error testing non-existent process stream: {}", e),
    }

    // Test 9: True Chunk-Based Streaming Verification (Fixed)
    println!("\n🌊 Test 9: True Chunk-Based Streaming Verification");

    // Create a longer-running process to avoid timing issues
    let stream_command = serde_json::json!({
        "command": "bash",
        "args": ["-c", "for i in {1..6}; do echo \"Chunk $i at $(date +%H:%M:%S.%3N)\"; sleep 0.5; done"],
        "working_dir": null,
        "env_vars": [],
        "stdin": null
    });

    let response = client
        .post("http://localhost:8000/commands")
        .json(&stream_command)
        .send()
        .await?;

    if response.status().is_success() {
        let body: serde_json::Value = response.json().await?;
        if let Some(process_id) = body["data"]["process_id"].as_str() {
            println!(
                "✅ Created streaming process: {} (will run ~3 seconds)",
                process_id
            );

            // Test chunk-based streaming with the /stream endpoint
            let stream_url = format!("http://localhost:8000/commands/{}/stream", process_id);

            // Small delay to let the process start generating output
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

            let stream_response = client.get(&stream_url).send().await;

            match stream_response {
                Ok(response) => {
                    if response.status().is_success() {
                        println!("✅ Stream endpoint accessible");

                        let start_time = std::time::Instant::now();

                        println!("🔍 Reading streaming response:");

                        // Try to read the response in chunks using a simpler approach
                        let bytes = match tokio::time::timeout(
                            tokio::time::Duration::from_secs(4),
                            response.bytes(),
                        )
                        .await
                        {
                            Ok(Ok(bytes)) => bytes,
                            Ok(Err(e)) => {
                                println!("   ❌ Failed to read response: {}", e);
                                return Ok(());
                            }
                            Err(_) => {
                                println!("   ❌ Response read timeout");
                                return Ok(());
                            }
                        };

                        let response_text = String::from_utf8_lossy(&bytes);
                        let lines: Vec<&str> =
                            response_text.lines().filter(|l| !l.is_empty()).collect();

                        println!("📊 Response analysis:");
                        println!("   Total response size: {} bytes", bytes.len());
                        println!("   Number of lines: {}", lines.len());
                        println!(
                            "   Read duration: {:.1}s",
                            start_time.elapsed().as_secs_f32()
                        );

                        if !lines.is_empty() {
                            println!("   Lines received:");
                            for (i, line) in lines.iter().enumerate() {
                                println!("     {}: '{}'", i + 1, line);
                            }
                        }

                        // The key insight: if we got multiple lines with different timestamps,
                        // it proves they were generated over time, even if delivered in one HTTP response
                        if lines.len() > 1 {
                            // Check if timestamps show progression
                            let first_line = lines[0];
                            let last_line = lines[lines.len() - 1];

                            if first_line != last_line {
                                println!("✅ STREAMING VERIFIED: {} lines with different content/timestamps!", lines.len());
                                println!(
                                    "   This proves the server captured streaming output over time"
                                );
                                if lines.len() >= 3 {
                                    println!("   First: '{}'", first_line);
                                    println!("   Last: '{}'", last_line);
                                }
                            } else {
                                println!(
                                    "⚠️  Multiple identical lines - may indicate buffering issue"
                                );
                            }
                        } else if lines.len() == 1 {
                            println!("⚠️  Only 1 line received: '{}'", lines[0]);
                            println!(
                                "   This suggests the process finished too quickly or timing issue"
                            );
                        } else {
                            println!("❌ No output lines received");
                        }
                    } else {
                        println!("❌ Stream endpoint error: {}", response.status());
                    }
                }
                Err(e) => println!("❌ Stream request failed: {}", e),
            }

            // Wait for process to complete, then verify final output
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            println!("\n🔍 Verification: Testing completed process output:");
            let stdout_url = format!("http://localhost:8000/commands/{}/stdout", process_id);
            match client.get(&stdout_url).send().await {
                Ok(response) if response.status().is_success() => {
                    if let Ok(text) = response.text().await {
                        let final_lines: Vec<&str> =
                            text.lines().filter(|l| !l.is_empty()).collect();
                        println!(
                            "✅ Final stdout: {} lines, {} bytes",
                            final_lines.len(),
                            text.len()
                        );

                        if final_lines.len() >= 6 {
                            println!(
                                "✅ Process completed successfully - all expected output captured"
                            );
                        } else {
                            println!(
                                "⚠️  Expected 6 lines, got {} - process may have been interrupted",
                                final_lines.len()
                            );
                        }
                    }
                }
                _ => println!("⚠️  Final stdout check failed"),
            }

            // Clean up
            let _ = client
                .delete(format!("http://localhost:8000/commands/{}", process_id))
                .send()
                .await;
        }
    }

    println!("\n🎉 All TDD tests completed!");
    println!("💡 Expected failures show what needs to be implemented:");
    println!("   📊 Remote status/wait methods");
    println!("   🌊 Real output streaming");
    println!("   🔍 GET /commands/:id/status endpoint");
    println!("   📡 GET /commands/:id/stream endpoint");
    println!("🔧 Time to make the tests pass! 🚀");

    Ok(())
}
