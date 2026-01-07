mod handoff;
mod jwt;
mod middleware;
mod oauth_token_validator;
mod provider;

pub use handoff::{CallbackResult, HandoffError, OAuthHandoffService};
pub use jwt::{JwtError, JwtService};
pub use middleware::{RequestContext, require_session};
pub use oauth_token_validator::{OAuthTokenValidationError, OAuthTokenValidator};
pub use provider::{
    GitHubOAuthProvider, GoogleOAuthProvider, ProviderRegistry, ProviderTokenDetails,
};
