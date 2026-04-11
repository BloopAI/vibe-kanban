use uuid::Uuid;

use crate::auth::RequestContext;

#[derive(Debug, Clone, Copy)]
pub enum AuditAction {
    AuthLogin,
    AuthLogout,
    AuthTokenRefresh,
    AuthTokenReuseDetected,
    AuthSessionRevoked,

    MemberInvite,
    MemberAcceptInvite,
    MemberRevokeInvite,
    MemberRemove,
    MemberRoleChange,
}

impl AuditAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::AuthLogin => "auth.login",
            Self::AuthLogout => "auth.logout",
            Self::AuthTokenRefresh => "auth.token_refresh",
            Self::AuthTokenReuseDetected => "auth.token_reuse_detected",
            Self::AuthSessionRevoked => "auth.session_revoked",
            Self::MemberInvite => "member.invite",
            Self::MemberAcceptInvite => "member.accept_invite",
            Self::MemberRevokeInvite => "member.revoke_invite",
            Self::MemberRemove => "member.remove",
            Self::MemberRoleChange => "member.role_change",
        }
    }
}

/// A single audit log event.
#[derive(Debug, Clone)]
pub struct AuditEvent {
    pub action: AuditAction,
    pub user_id: Option<Uuid>,
    pub session_id: Option<Uuid>,
    pub resource_type: Option<&'static str>,
    pub resource_id: Option<Uuid>,
    pub organization_id: Option<Uuid>,
    pub http_method: Option<String>,
    pub http_path: Option<String>,
    pub http_status: Option<u16>,
    pub description: Option<String>,
}

impl AuditEvent {
    /// Create an event populated from a request context (user, session).
    pub fn from_request(ctx: &RequestContext, action: AuditAction) -> Self {
        Self {
            action,
            user_id: Some(ctx.user.id),
            session_id: Some(ctx.session_id),
            resource_type: None,
            resource_id: None,
            organization_id: None,
            http_method: None,
            http_path: None,
            http_status: None,
            description: None,
        }
    }

    /// Create a system-level event with no request context.
    pub fn system(action: AuditAction) -> Self {
        Self {
            action,
            user_id: None,
            session_id: None,
            resource_type: None,
            resource_id: None,
            organization_id: None,
            http_method: None,
            http_path: None,
            http_status: None,
            description: None,
        }
    }

    pub fn resource(mut self, resource_type: &'static str, resource_id: Option<Uuid>) -> Self {
        self.resource_type = Some(resource_type);
        self.resource_id = resource_id;
        self
    }

    pub fn organization(mut self, id: Uuid) -> Self {
        self.organization_id = Some(id);
        self
    }

    pub fn http(mut self, method: &str, path: impl Into<String>, status: u16) -> Self {
        self.http_method = Some(method.into());
        self.http_path = Some(path.into());
        self.http_status = Some(status);
        self
    }

    pub fn description(mut self, desc: impl Into<String>) -> Self {
        self.description = Some(desc.into());
        self
    }

    pub fn user(mut self, user_id: Uuid, session_id: Option<Uuid>) -> Self {
        self.user_id = Some(user_id);
        self.session_id = session_id;
        self
    }
}

/// Emit an audit event as a structured tracing log.
/// Uses `target: "audit"` for filtering in the backend.
pub fn emit(event: AuditEvent) {
    tracing::info!(
        target: "audit",
        audit_action = event.action.as_str(),
        audit_user_id = event.user_id.map(|u| u.to_string()).unwrap_or_default(),
        audit_session_id = event.session_id.map(|s| s.to_string()).unwrap_or_default(),
        audit_resource_type = event.resource_type.unwrap_or(""),
        audit_resource_id = event.resource_id.map(|r| r.to_string()).unwrap_or_default(),
        audit_organization_id = event.organization_id.map(|o| o.to_string()).unwrap_or_default(),
        audit_http_method = event.http_method.as_deref().unwrap_or(""),
        audit_http_path = event.http_path.as_deref().unwrap_or(""),
        audit_http_status = event.http_status.unwrap_or(0),
        audit_description = event.description.as_deref().unwrap_or(""),
        "audit_event"
    );
}
