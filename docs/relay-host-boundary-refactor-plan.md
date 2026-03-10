---
title: Relay Host Boundary Refactor Plan
description: Boundary-first refactor plan for relay host access, pairing, and runtime registration.
---

# Relay Host Boundary Refactor Plan

## Summary

This plan supersedes the narrower transport cleanup in
`relay-host-transport-refactor-plan.md`.

The goal is not to keep polishing
`crates/server/src/host_relay/transport.rs`, but to redraw the relay
boundaries so the code follows actual responsibilities:

- protocol and wire types
- low-level relay SDK
- host-relay application service
- server route adapters
- background relay registration runtime

This plan assumes a dedicated host-relay application boundary, implemented
either as a new crate or as a server-private module with the same API
constraints. The acceptance criteria are about ownership and coupling, not
file layout.

## Status

This plan is now complete.

- Done: relay host credential and auth-state access now live behind a
  dedicated `RelayHostStore`.
- Done: the host-relay application API now exposes `ResolvedHostRelay`
  directly, using a narrow module-level opening function instead of bootstrap
  and persist free functions or a dedicated dependency bundle type.
- Done: the host-relay application layer no longer depends on
  `DeploymentImpl`.
- Done: `relay_proxy` and `open_remote_editor` now consume the resolved host
  boundary instead of managing auth-state persistence directly.
- Done: pairing and relay-auth flows now live behind the dedicated
  `relay_pairing` application boundary.
- Done: `routes/relay_auth/client.rs` and `routes/relay_auth/server.rs` are
  now thin route adapters over `relay_pairing` wiring.
- Done: the paired-host route now uses the dedicated relay host store through
  the pairing boundary.
- Done: `DeploymentImpl` now appears inside relay pairing only in the module
  adapter layer.
- Validation: `cargo check -p local-deployment`, `cargo check -p server`, and
  `pnpm run format`.

## Original Leaks

Before this refactor the relay code had these boundary problems:

- `crates/server/src/host_relay/transport.rs` is not transport. It resolves
  state, bootstraps the SDK, and persists cache mutations.
- `crates/server/src/host_relay/proxy.rs` and
  `crates/server/src/routes/open_remote_editor.rs` both orchestrate the same
  flow:
  - resolve host relay access
  - perform operation
  - persist auth state
  - map errors
- `DeploymentImpl` leaks into host-relay code even though the host-relay
  layer only needs a small subset of services.
- routes still reach through to raw `RelayHostTransport` details such as
  signing key, signing session id, relay URL, and server verify key.
- pairing/auth, host access, and background registration are still adjacent
  concerns rather than separate boundaries.

## Recommended End State

### `relay-types`

Own only stable shared data:

- relay request and response DTOs
- `RemoteSession`
- `RelayAuthState`

It must not depend on:

- crypto key types
- reqwest
- Axum
- deployment or cache services

### `relay-client`

Remain the low-level relay SDK:

- `RelayApiClient`
- SPAKE2 pairing
- session bootstrap and signing refresh requests
- signed HTTP transport
- signed websocket connect
- transport retry and auth recovery
- `RelayHostTransport`

It must not depend on:

- `DeploymentImpl`
- route types
- Axum request or response types
- host credential storage or auth-state cache services

### Host-Relay Application Boundary

Introduce a dedicated host-relay application layer, referred to here as
`relay-host`.

It should own:

- paired host resolution
- cached relay auth-state load and save
- creation of `RelayHostTransport`
- application-facing host operations
- tunnel-access projection for open-in-editor or SSH tunnel flows
- semantic resolve and operation errors

It should depend only on narrow services:

- relay host credential store
- relay auth-state cache store
- `RemoteClient`
- relay base URL
- signing key

It should not depend on:

- `DeploymentImpl`
- Axum
- route response types

### `server`

Own only server integration:

- wiring from `DeploymentImpl` into the host-relay boundary
- Axum request parsing
- Axum response building
- websocket bridging
- route-specific error presentation

### Runtime Registration

Keep background relay registration separate from host access.

It should remain a runtime concern and must not share abstractions with
proxy/editor host access beyond low-level SDK usage.

## Proposed Public Shape

The host-relay boundary should expose one application-facing entrypoint:

```rust
pub struct ResolvedHostRelay { ... }

pub async fn open_host_relay(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Result<ResolvedHostRelay, HostRelayResolveError>;

impl ResolvedHostRelay {
    pub async fn open(
        host_id: Uuid,
        store: RelayHostStore,
        remote_client: RemoteClient,
        relay_base_url: String,
        signing_key: SigningKey,
    )
        -> Result<ResolvedHostRelay, HostRelayResolveError>;
}
```

The resolved handle should then expose host operations:

```rust
impl ResolvedHostRelay {
    pub async fn send_http(
        &mut self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<reqwest::Response, HostRelayOperationError>;

    pub async fn connect_ws(
        &mut self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<(SignedUpstreamSocket, Option<String>), HostRelayOperationError>;

    pub async fn get_json<T>(&mut self, path: &str)
        -> Result<T, HostRelayOperationError>
    where
        T: DeserializeOwned;

    pub fn tunnel_access(&self) -> RelayTunnelAccess;
}
```

The exact type names can change. The important part is that the route layer
gets a resolved host handle from a narrow opening function, not a bag of
bootstrap and persistence functions.

## Supporting Services

Extract dedicated services from `DeploymentImpl` rather than passing the
container through:

- `RelayHostStore`
  - load paired host credentials
  - parse/store paired host metadata
- `RelayAuthStateStore`
  - load cached remote session id
  - load cached signing session id
  - persist updated auth state

These can be one service or two. The critical rule is that the host-relay
boundary consumes them directly, not through `DeploymentImpl`.

## Refactor Phases

### Phase 1: Extract Host Relay Storage Services

Create dedicated relay host storage services and move these responsibilities
off `LocalDeployment`:

- paired host credential lookup
- cached relay auth-state read
- cached relay auth-state write

Outcome:

- `DeploymentImpl` becomes wiring only
- host-relay code depends on storage services, not the deployment container

### Phase 2: Introduce Host Relay Resolver and Handle

Replace the current free-function API in
`crates/server/src/host_relay/transport.rs` with:

- a cloneable resolver built from owned dependencies
- a resolved host handle that owns the `RelayHostTransport`
- automatic or encapsulated auth-state persistence

Outcome:

- remove separate `build_relay_host_transport`
- remove separate `persist_relay_auth_state`
- remove route-managed bootstrap/persist choreography

### Phase 3: Flatten the Error Model

Replace nested build/bootstrap enums with semantic boundary errors:

- resolve errors
- operation errors
- tunnel access errors if needed

Outcome:

- routes map from one host-relay resolve error type
- routes map from one host-relay operation error type

### Phase 4: Shrink Route Adapters

Refactor these callsites:

- `crates/server/src/host_relay/proxy.rs`
- `crates/server/src/routes/open_remote_editor.rs`

They should stop:

- building transports directly
- persisting auth state directly
- reading raw `RelayHostTransport` internals directly

### Phase 5: Re-home Pairing and Registration Concerns

Separate the remaining relay concerns by use case:

- pairing/auth flows
- host access/proxying
- background registration/runtime

This does not necessarily require new crates, but it does require separate
application boundaries.

Outcome:

- paired-host storage access is shared through the relay host store
- background relay registration remains isolated under runtime code
- relay-auth route files no longer orchestrate pairing or signing-session
  lifecycle directly

## Boundary Acceptance Criteria

The refactor is complete only when all of the following are true.

### Relay SDK Boundary

- `relay-client` contains no references to `DeploymentImpl`.
- `relay-client` contains no Axum request, response, or websocket upgrade
  types.
- `relay-client` contains no direct access to paired host credential storage
  or cached auth-state storage.

### Host-Relay Application Boundary

- the host-relay boundary exposes a resolved host handle or service, not
  separate bootstrap and persist functions
- the host-relay boundary depends only on narrow relay services and values
- the host-relay boundary public API has no borrowed service bag with visible
  lifetimes
- `DeploymentImpl` appears only in the server wiring adapter for host relay,
  not in the host-relay application API

### Route Boundary

- `crates/server/src/routes/relay_proxy.rs` does not call bootstrap or cache
  persistence helpers directly
- `crates/server/src/routes/open_remote_editor.rs` does not call bootstrap or
  cache persistence helpers directly
- routes do not read `RelayHostTransport::auth_state()` directly
- routes do not assemble tunnel credentials by reading multiple raw transport
  fields

### Pairing Boundary

- the relay pairing boundary owns relay-auth client pairing, enrollment, and
  signing-session refresh orchestration
- `crates/server/src/routes/relay_auth/client.rs` does not call
  `remote_client`, `shared_api_base`, `relay_signing`, or relay host storage
  directly
- `crates/server/src/routes/relay_auth/server.rs` does not call
  `trusted_key_auth` or `relay_signing` directly
- `DeploymentImpl` appears only in relay pairing wiring, not in the
  `relay_pairing` application API
- `DeploymentImpl` appears only in host-relay module wiring, not in the
  `host_relay::transport` application API

### Storage Boundary

- paired host credentials are accessed through a dedicated relay host store
- cached relay auth state is accessed through a dedicated auth-state store
- host-relay code does not call `LocalDeployment` methods for credential or
  cache access directly

### Runtime Boundary

- background relay registration remains separate from host access/proxy code
- host proxy/editor flows do not depend on registration runtime modules

## Suggested Verification Checks

Use these checks to confirm the boundaries after implementation:

- `rg "DeploymentImpl" crates/server/src/host_relay`
  - expected result: only the server wiring adapter remains, or no matches if
    moved out entirely
- `rg "build_relay_host_transport|persist_relay_auth_state" crates/server/src`
  - expected result: no route callsites
- `rg "auth_state\\(" crates/server/src/routes`
  - expected result: no direct route reads of relay transport auth state
- `rg "DeploymentImpl" crates/server/src/relay_pairing`
  - expected result: only `crates/server/src/relay_pairing/mod.rs`
- `rg "trusted_key_auth\\(|relay_signing\\(|remote_client\\(|shared_api_base\\(|relay_host_store\\(" crates/server/src/routes/relay_auth`
  - expected result: no matches
- `RUSTC_WRAPPER= cargo check -p relay-client`
- `RUSTC_WRAPPER= cargo check -p server`
- `pnpm run format`

## Non-Goals

This plan does not require:

- changing relay wire protocol shapes
- changing signing algorithms
- changing websocket bridge semantics
- changing remote registration behaviour beyond boundary placement
