mod handoff;
pub(crate) mod jwt;
mod local;
mod middleware;
mod oauth_token_validator;
mod provider;

pub use handoff::{CallbackResult, HandoffError, OAuthHandoffService};
pub use jwt::{DEFAULT_ACCESS_TOKEN_TTL_SECONDS, JwtError, JwtService};
pub(crate) use local::{LocalAuthError, auth_methods_response, is_local_provider, login};
pub use middleware::RequestContext;
pub(crate) use middleware::require_session;
pub use oauth_token_validator::{OAuthTokenValidationError, OAuthTokenValidator};
pub use provider::{ProviderRegistry, ProviderTokenDetails};
pub(crate) use provider::{GitHubOAuthProvider, GoogleOAuthProvider};
