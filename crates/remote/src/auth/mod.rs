mod handoff;
mod jwt;
mod local;
mod middleware;
mod oauth_token_validator;
mod provider;

pub(crate) use handoff::{CallbackResult, HandoffError, OAuthHandoffService};
pub(crate) use jwt::{JwtError, JwtService};
pub(crate) use local::{LocalAuthError, auth_methods_response, is_local_provider, login};
pub(crate) use middleware::{RequestContext, require_session};
pub(crate) use oauth_token_validator::{OAuthTokenValidationError, OAuthTokenValidator};
pub(crate) use provider::{
    GitHubOAuthProvider, GoogleOAuthProvider, ProviderRegistry, ProviderTokenDetails,
};
