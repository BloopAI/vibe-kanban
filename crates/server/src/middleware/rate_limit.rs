use axum::{
    extract::{ConnectInfo, Request},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use governor::{
    clock::DefaultClock,
    middleware::NoOpMiddleware,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use std::{
    collections::HashMap,
    net::SocketAddr,
    num::NonZeroU32,
    sync::Arc,
    time::Duration,
};
use tokio::sync::RwLock;
use utils::response::ApiResponse;

/// Rate limiter configuration
pub struct RateLimitConfig {
    /// Requests per window
    pub requests_per_window: u32,
    /// Window duration in seconds
    pub window_seconds: u64,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            requests_per_window: 100,
            window_seconds: 60,
        }
    }
}

/// Per-IP rate limiter using governor
pub struct IpRateLimiter {
    limiters: RwLock<HashMap<String, Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock, NoOpMiddleware>>>>,
    quota: Quota,
}

impl IpRateLimiter {
    pub fn new(config: RateLimitConfig) -> Self {
        let requests = NonZeroU32::new(config.requests_per_window).unwrap_or(NonZeroU32::new(100).unwrap());
        let quota = Quota::with_period(Duration::from_secs(config.window_seconds))
            .unwrap()
            .allow_burst(requests);

        Self {
            limiters: RwLock::new(HashMap::new()),
            quota,
        }
    }

    /// Get or create a rate limiter for an IP
    async fn get_limiter(&self, ip: &str) -> Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock, NoOpMiddleware>> {
        // Check if limiter exists
        {
            let limiters = self.limiters.read().await;
            if let Some(limiter) = limiters.get(ip) {
                return limiter.clone();
            }
        }

        // Create new limiter
        let limiter = Arc::new(RateLimiter::direct(self.quota));

        // Insert into map
        {
            let mut limiters = self.limiters.write().await;
            limiters.insert(ip.to_string(), limiter.clone());
        }

        limiter
    }

    /// Check if request is allowed
    pub async fn check(&self, ip: &str) -> Result<(), RateLimitError> {
        let limiter = self.get_limiter(ip).await;

        match limiter.check() {
            Ok(_) => Ok(()),
            Err(not_until) => {
                let wait_time = not_until.wait_time_from(governor::clock::Clock::now(&DefaultClock::default()));
                Err(RateLimitError {
                    retry_after_secs: wait_time.as_secs(),
                })
            }
        }
    }

    /// Clean up old limiters (call periodically)
    pub async fn cleanup(&self) {
        let mut limiters = self.limiters.write().await;
        // Remove limiters that haven't been used recently
        // In production, you'd want to track last access time
        if limiters.len() > 10000 {
            limiters.clear();
        }
    }
}

#[derive(Debug)]
pub struct RateLimitError {
    pub retry_after_secs: u64,
}

impl IntoResponse for RateLimitError {
    fn into_response(self) -> Response {
        let response = ApiResponse::<()>::error("Too many requests. Please try again later.");

        (
            StatusCode::TOO_MANY_REQUESTS,
            [("Retry-After", self.retry_after_secs.to_string())],
            Json(response),
        ).into_response()
    }
}

/// Extract client IP from request
fn get_client_ip(request: &Request) -> String {
    // Check X-Forwarded-For header first (for proxies)
    if let Some(forwarded) = request.headers().get("x-forwarded-for") {
        if let Ok(value) = forwarded.to_str() {
            // Take first IP in the chain
            if let Some(ip) = value.split(',').next() {
                return ip.trim().to_string();
            }
        }
    }

    // Check X-Real-IP header
    if let Some(real_ip) = request.headers().get("x-real-ip") {
        if let Ok(ip) = real_ip.to_str() {
            return ip.to_string();
        }
    }

    // Fallback to connection info (if available via extension)
    if let Some(connect_info) = request.extensions().get::<ConnectInfo<SocketAddr>>() {
        return connect_info.0.ip().to_string();
    }

    // Default fallback
    "unknown".to_string()
}

/// Rate limiting middleware
pub async fn rate_limit_middleware(
    request: Request,
    next: Next,
    rate_limiter: Arc<IpRateLimiter>,
) -> Result<Response, RateLimitError> {
    let ip = get_client_ip(&request);

    // Check rate limit
    rate_limiter.check(&ip).await?;

    Ok(next.run(request).await)
}

/// Create rate limit middleware layer
pub fn create_rate_limit_layer(config: RateLimitConfig) -> Arc<IpRateLimiter> {
    Arc::new(IpRateLimiter::new(config))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter_allows_requests() {
        let limiter = IpRateLimiter::new(RateLimitConfig {
            requests_per_window: 5,
            window_seconds: 60,
        });

        // Should allow first 5 requests
        for _ in 0..5 {
            assert!(limiter.check("127.0.0.1").await.is_ok());
        }
    }

    #[tokio::test]
    async fn test_rate_limiter_blocks_excess() {
        let limiter = IpRateLimiter::new(RateLimitConfig {
            requests_per_window: 2,
            window_seconds: 60,
        });

        // First 2 should succeed
        assert!(limiter.check("127.0.0.1").await.is_ok());
        assert!(limiter.check("127.0.0.1").await.is_ok());

        // Third should fail
        assert!(limiter.check("127.0.0.1").await.is_err());
    }

    #[tokio::test]
    async fn test_different_ips_independent() {
        let limiter = IpRateLimiter::new(RateLimitConfig {
            requests_per_window: 1,
            window_seconds: 60,
        });

        assert!(limiter.check("192.168.1.1").await.is_ok());
        assert!(limiter.check("192.168.1.2").await.is_ok());

        // Same IPs should now be limited
        assert!(limiter.check("192.168.1.1").await.is_err());
        assert!(limiter.check("192.168.1.2").await.is_err());
    }
}
