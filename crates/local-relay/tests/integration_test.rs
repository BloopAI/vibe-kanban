async fn start_relay(token: &str) -> u16 {
    let app = local_relay::server::build_app(token.to_string());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    port
}

#[tokio::test]
async fn test_health_returns_ok() {
    let port = start_relay("tok").await;
    let resp = reqwest::get(format!("http://127.0.0.1:{port}/health"))
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
}

#[tokio::test]
async fn test_connect_without_token_is_401() {
    let port = start_relay("secret").await;
    let resp = reqwest::Client::new()
        .get(format!(
            "http://127.0.0.1:{port}/v1/relay/connect?machine_id=abc&name=test"
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn test_proxy_unknown_machine_is_404() {
    let port = start_relay("tok").await;
    let resp = reqwest::get(format!(
        "http://127.0.0.1:{port}/v1/relay/h/unknown-machine/s/session/"
    ))
    .await
    .unwrap();
    assert_eq!(resp.status(), 404);
}
