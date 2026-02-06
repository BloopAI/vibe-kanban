use axum::{routing::get, Router};
use sqlx::sqlite::SqlitePoolOptions;

mod routes;

async fn health() -> &'static str {
    "OK"
}

#[tokio::main]
async fn main() {
    let database_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite::memory:".to_string());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to database");

    let app = Router::new()
        .route("/health", get(health))
        .merge(routes::meetings::router())
        .with_state(pool);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8081")
        .await
        .unwrap();
    axum::serve(listener, app).await.unwrap();
}
