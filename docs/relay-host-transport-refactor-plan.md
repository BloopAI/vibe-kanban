---
title: Relay Host Transport Refactor Plan
description: Planned restructuring of relay host transport responsibilities across relay-types, relay-client, and server.
---

# Relay Host Transport Refactor Plan

## Summary

This refactor replaced the old split across `server::relay::{session,proxy}` with a cleaner architecture:

- `relay-types` owns relay protocol contracts and small shared data types.
- `relay-client` becomes the real relay SDK and owns host transport state, signed request execution, websocket connect, and auth/session recovery.
- `server` becomes an integration layer that resolves local environment state from `DeploymentImpl`, constructs the SDK transport, persists updated auth state, and adapts results to Axum.

This is a structural refactor, not a compatibility-preserving cleanup.

## Status

- Done: `relay-types` now owns `RelayAuthState`.
- Done: `relay-client` now owns `RelayHostIdentity`, `RelayHostTransport`, bootstrap, and transport recovery.
- Done: low-level relay transport helpers are now private to `relay-client`, so callers go through the SDK transport surface instead of bypassing it.
- Done: the old `server::relay::session` layer has been replaced by `server::host_relay`, which now resolves environment state and persists relay auth state instead of owning transport behaviour.
- Done: the old `server::relay::proxy` path has been reduced to `server::host_relay::proxy`, and both it and `open_remote_editor` now use `RelayHostTransport`.
- Done: the remaining server-local relay code now lives under role-based modules instead of a catch-all `server::relay` bucket.
- Next: add focused SDK and server integration tests around auth recovery, cache persistence, and route-level error mapping.

## Original Problems

- Relay behaviour was split between `server::relay::session` and `server::relay::proxy`.
- `server` owned relay session mutation and retry policy.
- There were too many overlapping abstractions: `RelayHostContext`, `RelayHostSession`, and `RelayConnection`.
- Routes and adapters knew too much about relay recovery behaviour.
- `relay-client` existed, but it was still too low-level to be the real reusable SDK boundary.

## Target Architecture

### `relay-types`

`relay-types` should own only stable shared relay data:

- Relay wire DTOs.
- `RemoteSession`.
- `RelayAuthState { remote_session, signing_session_id }`.

It should not own:

- crypto key types
- reqwest or Axum types
- deployment or cache concerns

### `relay-client`

`relay-client` should become the actual relay SDK.

It should own:

- `RelayApiClient`
- signed HTTP transport
- signed websocket connect
- pairing
- signing-session refresh
- remote-session rotation
- typed relay transport state

It should expose stateful transport types such as:

- `RelayHostIdentity { host_id, client_id, server_verify_key }`
- `RelayHostTransport { api_client, identity, auth_state, signing_key }`

It should expose typed operations such as:

- `send_http(method, path, headers, body)`
- `connect_ws(path, protocols)`
- `get_signed_json(path)`

It should own auth/session recovery internally rather than exposing generic retry helpers.

### `server`

`server` should own only app integration:

- loading paired host metadata from deployment
- loading and persisting cached auth state
- access token lookup
- signing key lookup
- Axum request and response adaptation
- Axum websocket bridging
- route-level error mapping

`server` should stop owning relay session behaviour and retry orchestration.

## End-State Server Flow

1. Load paired host metadata from deployment storage.
2. Load cached auth state from deployment cache.
3. Build `relay_client::RelayHostTransport`.
4. Call typed SDK operations such as `send_http`, `connect_ws`, or `get_signed_json`.
5. Persist updated auth state back to deployment cache.
6. Convert results into Axum responses or websocket bridges.

## End-State SDK Flow

`relay-client` should own:

- bootstrap from existing auth state
- refresh signing session on auth failure
- rotate remote session when refresh is not enough
- retry once after refresh and once after rotation
- mutation of in-memory `RelayAuthState`

The SDK should return semantic errors rather than server-specific orchestration errors.

## Concrete Refactor Steps

### Phase 1: Expand `relay-types`

Add or confirm these shared types in `crates/relay-types/src/lib.rs`:

- `RemoteSession`
- `RelayAuthState`

Keep `relay-types` dependency-light.

Status: complete.

### Phase 2: Promote `relay-client` into a real SDK

Refactor `crates/relay-client/src/lib.rs` to add:

- `RelayHostIdentity`
- `RelayHostTransport`
- semantic error enums for init, HTTP, websocket, and signed JSON operations

Move into `relay-client`:

- session refresh logic
- remote session rotation logic
- retry policy
- host transport state

Hide low-level helpers unless they are still needed outside the crate.

Status: complete.

### Phase 3: Replace server-owned relay session abstractions

Remove or replace in `crates/server/src/relay/session.rs`:

- `RelayHostSession`
- `RelayHostContext`
- `RelayOperationAttempt`
- `RelayRecoveryError`
- generic retry helpers

Replace them with server-only environment resolvers:

- paired host lookup
- cached auth state load and save
- relay base URL and access token resolution
- transport construction for the SDK

Status: complete.

### Phase 4: Shrink the host relay proxy adapter

Refactor the host relay proxy adapter so it becomes a thin Axum adapter.

It should keep:

- request parsing
- body extraction
- Axum response rebuilding
- websocket bridging
- route-facing HTTP error mapping

It should stop owning:

- relay session mutation
- retry orchestration
- direct transport recovery logic

Status: complete.

### Phase 5: Refactor `open_remote_editor`

Refactor `crates/server/src/routes/open_remote_editor.rs` to:

- build the SDK transport through server resolvers
- call a typed signed JSON method
- persist updated auth state after the call
- map semantic SDK errors to route responses

It should stop knowing about refresh-versus-rotate behaviour.

Status: complete.

### Phase 6: Clean up module boundaries

Once the new split is complete:

- remove `server::relay::session` as a transport layer
- reduce the per-host proxy path to pure web adaptation
- keep relay registration separate, since it is a background runtime concern
- consider renaming the remaining server module if `relay` is no longer the right boundary

Status: complete. The per-host integration code now lives under `server::host_relay`, and the background reconnect loop now lives under `server::runtime::relay_registration`.

## Proposed Public APIs

### `relay-types`

Expected public surface:

- wire request and response DTOs
- `RemoteSession`
- `RelayAuthState`

### `relay-client`

Expected public surface:

- `RelayApiClient`
- `RelayHostIdentity`
- `RelayHostTransport`
- pairing entrypoints
- semantic transport error enums

Expected non-public surface:

- low-level request signing helpers
- low-level websocket connection assembly
- internal recovery machinery

### `server`

Expected public surface:

- route handlers
- Axum-facing proxy helpers
- background relay registration loop

Expected server-private relay integration surface:

- paired host resolution
- cached auth state resolution
- SDK transport construction
- auth state persistence

## Error Model

### Server-side resolver errors

These errors occur before the SDK runs:

- host not paired
- invalid stored client metadata
- invalid stored signing metadata
- relay not configured
- access token unavailable

### SDK errors

These errors occur during transport operations:

- upstream unavailable
- auth recovery failed
- peer validation failed
- protocol error

Routes should translate these semantic errors into HTTP responses or API payload errors.

## Validation Plan

Run:

- `RUSTC_WRAPPER= cargo check -p relay-types`
- `RUSTC_WRAPPER= cargo check -p relay-client`
- `RUSTC_WRAPPER= cargo check -p server`
- `pnpm run format`

Then confirm:

- `server::host_relay::proxy` no longer contains retry orchestration
- `open_remote_editor` no longer knows about refresh and rotate policy
- `relay-client` owns relay transport recovery
- `relay-types` remains protocol-focused

## Follow-Up Tests

After the refactor lands, add focused tests in `relay-client` for:

- auth failure followed by signing refresh success
- auth failure followed by signing refresh failure
- auth failure followed by signing refresh, then session rotation, then success

Add server-side tests for:

- paired host resolution
- cached auth state persistence
- route-level error mapping
