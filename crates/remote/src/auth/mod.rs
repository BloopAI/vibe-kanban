mod handoff;
mod jwt;
mod middleware;
mod oauth_token_validator;
mod provider;
pub(crate) mod server;
mod token_refresh;

pub use handoff::{CallbackResult, HandoffError, OAuthHandoffService};
pub use jwt::{ACCESS_TOKEN_TTL_SECONDS, JwtError, JwtService};
pub use middleware::{RequestContext, request_context_from_access_token, require_session};
pub use oauth_token_validator::{OAuthTokenValidationError, OAuthTokenValidator};
pub use provider::{
    GitHubOAuthProvider, GoogleOAuthProvider, ProviderRegistry, ProviderTokenDetails,
};
pub use token_refresh::{TokenRefreshError, refresh_user_tokens};
