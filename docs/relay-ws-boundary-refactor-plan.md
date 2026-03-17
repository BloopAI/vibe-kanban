# Relay WebSocket Boundary Refactor Plan

Date: 2026-03-17
Status: Updated after Wave 2 cutover; includes Wave 3 "straight-line" redesign
Owner: Codex

## Objective

Refactor the relay WebSocket stack so the code is organised around clear domain boundaries rather than around transport libraries and generic `Stream`/`Sink` plumbing.

This plan assumes a single hard cutover. There will be no compatibility layer, no dual API period, and no long-lived transitional surface area.

The end state should make these questions easy to answer by inspection:

- What is the wire protocol?
- What is signed and verified?
- Which code is transport-specific?
- Which code is tunnel-specific?
- Which code is application-facing?
- If a byte is written into the tunnel, where exactly does it become a signed relay message?

This document now covers three waves:

- Wave 1: the hard-cutover boundary refactor that has already landed
- Wave 2: the concrete-crate cleanup that has now landed
- Wave 3: the "with hindsight, make it totally straightforward" redesign

Wave 3 must also be a single hard cutover:

- one branch
- one review cycle
- one merge
- no compatibility layer
- no dual API period
- no deprecated transitional surface
- old abstractions deleted in the same change that introduces their replacements

## Current State After Wave 2

The code now has explicit protocol, crypto, client, and server crates:

- `relay-ws-protocol`
- `relay-ws-crypto`
- `relay-ws-client`
- `relay-ws-server`

That is materially better than the original single-file generic design, but some readability compromises still remain:

- Upgrade authentication and post-upgrade frame signing still live close together in the client connect flow.
- `RelaySessionCrypto` still leaks into public application-facing APIs even though it is really frame-signing state.
- Public sender/receiver split types still exist in the client/server crates.
- The tunnel runtime is still derived from the message-socket runtime instead of being a first-class product-specific path.
- The server upgrade path still exposes one runtime type that internally branches between plain and signed behaviour.

The rest of this plan describes the next redesign pass that would remove those remaining compromises.

## Current Problems

- Request signing for the websocket upgrade and frame signing after the websocket upgrade are still conceptually too close together.
- The public API still exposes lower-level relay mechanics such as session crypto or split sender/receiver types.
- Tunnel code and application WebSocket code still share runtime concepts that should be separated.
- The current flow is readable once understood, but it is still not the shortest path from call site to "what exactly is being signed here?"
- The simplest mental model would be "authenticate the upgrade, then authenticate the stream", and the current design is not yet shaped that way.

## Target Design

Split the system into four layers.

### 1. Protocol layer

Purpose: represent relay WebSocket messages and signed envelopes as plain domain types.

Responsibilities:

- Own the canonical message model.
- Own the canonical signed envelope format.
- Own serialisation and deserialisation of signed envelopes.
- Contain no `axum`, `tungstenite`, `Stream`, `Sink`, or `AsyncRead` concepts.

Proposed types:

- `RelayMessage`
- `RelayClose`
- `SignedRelayEnvelope`
- `RelayMessageType`

### 2. Crypto layer

Purpose: sign and verify relay envelopes for a session.

Responsibilities:

- Own request nonce and session identity handling.
- Own signing input construction.
- Own outbound sequence and inbound sequence validation.
- Return and accept protocol-layer types only.

Proposed types:

- `RelaySessionCrypto`
- `OutboundRelaySigner`
- `InboundRelayVerifier`

### 3. Transport adapter layer

Purpose: translate external WebSocket libraries into the protocol-layer message model.

Responsibilities:

- Convert `axum::extract::ws::Message` to and from `RelayMessage`.
- Convert `tokio_tungstenite::tungstenite::Message` to and from `RelayMessage`.
- Own transport-specific close-frame mapping.
- Keep transport-specific quirks fully out of the crypto and protocol layers.

Proposed modules:

- `transport/axum.rs`
- `transport/tungstenite.rs`

### 4. Application-facing layer

Purpose: expose high-level primitives for the two real use cases in this repo.

Responsibilities:

- Provide a message-oriented signed socket API for server routes and proxy flows.
- Provide a byte-stream tunnel API for TCP bridging.
- Hide transport generic machinery from normal call sites.

Proposed APIs:

- `signed_axum_socket(...) -> SignedRelaySocket`
- `signed_tungstenite_socket(...) -> SignedRelaySocket`
- `connect_signed_tunnel_io(...) -> impl AsyncRead + AsyncWrite`

## Final-Form Design Principles

With hindsight, the cleanest end state should prefer product-specific readability over generic reuse.

Guidelines:

- No public API should expose transport generics such as `<S, A, E>`.
- No public API should require readers to understand reusable `Stream`/`Sink` plumbing to answer domain questions.
- Public APIs should be concrete and use-case-specific even if that duplicates some internal logic.
- Plain websocket routes and signed relay routes should not share a mixed wrapper type unless the product genuinely needs polymorphism there.
- Client bootstrap should have one obvious entrypoint that owns request signing headers, websocket connect, and relay session crypto setup.
- Route-level websocket bridges should be hidden behind named helpers rather than repeated inline loops.
- Generic reuse is acceptable inside private implementation modules, but it should not shape the public mental model.
- The final cleanup wave should land as one hard cutover, not as a staged compatibility migration.

## Final-Form Public APIs

The eventual public boundary should look closer to this:

- `RelayTunnelClient::connect(...) -> RelayTunnelStream`
- `RelayTunnelStream: AsyncRead + AsyncWrite`
- `RelayServerUpgrade::into_signed_socket(...) -> SignedAxumSocket`
- `RelayServerUpgrade::into_signed_tunnel(...) -> RelayTunnelStream`
- `bridge_axum_client_to_signed_upstream(...)`
- `connect_signed_relay_websocket(...)`

Notably absent from this target shape:

- public `SignedRelaySocket<S, A>`
- public `RelayTransportAdapter`
- public split sender/receiver types
- public "maybe signed, maybe plain" websocket wrappers

## Wave 3: Straight-Line Redesign

With hindsight, the cleanest design is not "generic but hidden." It is "two security boundaries, two product runtimes, one obvious session object."

The primary conceptual split should be:

- upgrade authentication: prove the websocket upgrade request is allowed
- frame authentication: sign and verify every message after the socket is open

Those are different jobs and should not share the same public API surface.

### Straight-Line Public API

The public API should collapse to one product-facing concept:

- `RelaySession`

That session should expose only the use cases the product actually has:

- `RelaySession::connect_socket(path, protocol) -> RelaySocket`
- `RelaySession::connect_tunnel(path) -> RelayTunnel`
- `RelayWsUpgrade::on_socket(...)`
- `RelayWsUpgrade::on_tunnel(...)`

What should disappear from the public model:

- `RelaySessionCrypto`
- public sender/receiver split types
- public "upstream socket" transport helpers
- direct use of `build_request_signature(...)` in websocket entrypoints
- deriving tunnel behaviour by reusing the message-socket runtime

### Straight-Line Security Boundary

The redesign should make upgrade authentication and frame authentication visibly separate.

Proposed split:

- `request_auth`
  - owns HTTP header/query signing for relay upgrade requests
  - builds signed websocket upgrade requests
  - never knows about websocket frames
- `frame_auth`
  - owns relay envelope signing and verification after upgrade
  - never knows about HTTP headers or request construction

The call flow should read like this:

1. `RelaySession` asks `request_auth` to build an authenticated upgrade request.
2. The websocket connection is established.
3. The resulting runtime asks `frame_auth` to sign outbound frames and verify inbound frames.

### Tunnel-First Runtime

The tunnel path should stop reusing the message-oriented runtime.

Instead, the tunnel should have its own explicit runtime with its own explicit steps:

1. read bytes from local TCP
2. wrap those bytes as a relay binary payload
3. sign that payload into a relay envelope
4. write the signed envelope to the websocket

Inbound:

1. read a websocket frame
2. decode and verify the relay envelope
3. extract the relay binary payload
4. write bytes back to TCP

This means the tunnel module should call named steps like:

- `sign_outbound_chunk(...)`
- `verify_inbound_chunk(...)`

Even if those functions are thin wrappers over shared crypto internals, the tunnel path should read directly in terms of bytes and signed chunks, not in terms of a generic message socket that later becomes a tunnel.

### Socket Runtime

The message-oriented websocket path should also stand on its own.

The socket runtime should read like:

1. accept/send semantic websocket messages
2. sign or verify relay envelopes
3. adapt to axum or tungstenite only at the edge

Tunnel and socket may share protocol and frame crypto, but they should not share their top-level runtime type.

### Straight-Line Module Ownership

The cleanest end state probably keeps the current crates, but changes what they own:

- `relay-ws-protocol`
  - relay messages
  - signed envelope encoding/decoding
- `relay-ws-frame-auth`
  - sequence tracking
  - frame signing and verification
- `relay-ws-request-auth`
  - upgrade-request signing
  - header/query encoding
- `relay-ws-client`
  - `RelaySession`
  - concrete tungstenite socket runtime
  - concrete tungstenite tunnel runtime
- `relay-ws-server`
  - concrete axum upgrade/runtime types
  - server socket and tunnel entrypoints

If crate churn is undesirable, `request_auth` and `frame_auth` can remain modules at first, but they should still be treated as separate ownership boundaries.

### If Compatibility Can Break

If a protocol v3 is allowed, the signed websocket channel should become binary-only.

That means:

- all signed relay envelopes are binary websocket frames
- websocket text transport is not part of the signed relay channel
- ping/pong stays transport-local rather than appearing in the core relay message model unless the product truly needs it

That would reduce the wire model to:

- authenticate the upgrade with signed request metadata
- authenticate the stream with binary signed envelopes

That is the straightest possible design.

## Boundary Changes Still Wanted

### 1. Delete the generic public signed-socket core

`SignedRelaySocket<S, A>` is a better abstraction than the old design, but it is still an abstraction designed around library reuse rather than around the actual product entrypoints.

Target outcome:

- Replace the public generic signed-socket surface with concrete client/server/tunnel entrypoints.
- Allow some axum and tungstenite duplication if that makes call sites and implementation traces easier to read.

### 2. Remove mixed plain/signed server wrappers

`MaybeSignedWebSocket` still forces one type to represent two different route behaviours.

Target outcome:

- Plain websocket routes use normal Axum websocket handling.
- Signed relay routes use a dedicated signed extractor or upgrade path.
- Tunnel routes use a dedicated signed tunnel extractor or upgrade path.

### 3. Centralise signed relay client bootstrap

Request header signing, websocket handshake, and relay session crypto construction should not be reassembled in multiple crates.

Target outcome:

- One client-facing connect helper owns:
  - request signing headers
  - websocket handshake
  - `RelaySessionCrypto` construction
  - transport-specific setup

### 4. Push bridge behaviour into named helpers

Routes should not manually shuttle frames unless that behaviour is itself the product logic.

Target outcome:

- Replace route-local loops with explicit bridge helpers.
- Route code should read as policy plus one bridge call.

### 5. Split crates by responsibility

The current module split is an improvement, but the crate boundary still groups protocol, crypto, client, server, and tunnel concerns too closely.

Target outcome:

- `relay-ws-protocol`
- `relay-ws-crypto`
- `relay-ws-client`
- `relay-ws-server`
- optional `relay-ws-bridge`

This is a readability and ownership improvement, not just a packaging exercise.

### 6. Consider a protocol v2 only if compatibility can change

The current JSON plus base64 envelope is readable and compatible, but not especially elegant.

Target outcome:

- Preserve the current wire format in the cleanup wave unless we explicitly choose to version the protocol.
- If compatibility constraints are relaxed later, evaluate a binary envelope format with the same signing semantics.

This is optional and should be treated as a separate protocol decision, not hidden inside a readability refactor.

## Public API Principles

The public API should optimise for readability at call sites, even if the internal implementation remains generic.

Guidelines:

- Public application-facing APIs should accept semantic inputs such as `RelaySessionCrypto`.
- Public application-facing APIs should not require the caller to reason about generic transport message types.
- `Stream`/`Sink` should remain an internal implementation detail where possible.
- Split sender/receiver internals should not be imported outside the relay implementation unless there is a strong concurrency reason.
- Old and new public surfaces must not coexist after merge. The old API should be deleted in the same cutover that introduces the replacement API.
- The tunnel signing path must be explicit and locally traceable. A reader should be able to follow tunnel bytes to `RelayMessage::Binary`, then to signed envelope creation, in a short linear chain.
- Signing should happen in named components, not inside surprising generic trait implementations that require type inference to understand.
- Final-form public APIs should be concrete entrypoints, even if that means some duplication across axum and tungstenite implementations.
- Product use cases should own the top-level names. Internal generic reuse should not leak into route, client, or tunnel code.

## Tunnel Traceability Requirement

The tunnel path is a first-class readability constraint, not an incidental use case.

A reader starting from the tunnel call site should be able to trace this sequence with minimal jumping:

1. Local TCP bytes are read from the tunnel bridge.
2. Those bytes are converted into a relay binary message.
3. That relay message is signed into an outbound envelope.
4. That signed envelope is encoded onto the WebSocket transport.

The inverse path for inbound data should be similarly direct:

1. A transport frame is received.
2. The signed envelope is decoded and verified.
3. The relay binary message payload is extracted.
4. The payload bytes are written back to the TCP stream.

Design implication:

- The tunnel use case should not rely on readers understanding a generic `Sink<Message>` implementation to discover where signing happens.
- The tunnel module should call a named signing boundary directly or through a very thin wrapper with an obvious name.

## Proposed Module Layout

Option A keeps the current crate and improves structure. This is the recommended first step.

```text
crates/relay-control/src/
  relay_ws/
    mod.rs
    protocol.rs
    crypto.rs
    socket.rs
    transport/
      mod.rs
      axum.rs
      tungstenite.rs
    tunnel.rs
```

Option B turns `protocol` and `crypto` into their own crates later if we want cross-language or cross-runtime reuse. That should not be the first move unless there is a packaging reason.

## Final Crate Layout

If we take the cleanup all the way, the likely end state is:

```text
crates/
  relay-ws-protocol/
  relay-ws-crypto/
  relay-ws-client/
  relay-ws-server/
  relay-ws-bridge/        # optional
```

Responsibilities:

- `relay-ws-protocol`: `RelayMessage`, close handling, envelope encoding/decoding
- `relay-ws-crypto`: signer, verifier, signing input, sequencing
- `relay-ws-client`: tungstenite connect/bootstrap and tunnel client entrypoints
- `relay-ws-server`: axum upgrade/extractor types and server-side signed tunnel/socket entrypoints
- `relay-ws-bridge`: route-oriented helpers for websocket and tunnel bridging where helpful

## Phased Execution Plan

The phases below describe implementation order within a single branch. They are not separate rollout milestones. The intended delivery model is one branch, one review cycle, one merge, and one cutover.

### Phase 1: Isolate protocol types

Goals:

- Introduce a canonical `RelayMessage` and related types.
- Move envelope encoding and decoding out of transport-specific code.
- Keep all current behaviour unchanged.

Deliverables:

- New protocol module with unit tests.
- Old code adapted to use protocol types internally.

Exit criteria:

- Existing relay-control tests still pass.
- Protocol types are ready to support the later cutover.

### Phase 2: Isolate signing and verification

Goals:

- Move sequence tracking and signing input generation into dedicated crypto types.
- Rename `RelaySigningContext` to something closer to `RelaySessionCrypto`.

Deliverables:

- `OutboundRelaySigner`
- `InboundRelayVerifier`
- Tests for sequencing, tamper rejection, and close handling

Exit criteria:

- Protocol tests and crypto tests pass independently.
- No transport library appears in the crypto module.

### Phase 3: Move transport conversions to adapters

Goals:

- Remove `RelayTransportMessage` from the public conceptual model.
- Replace implicit transport normalisation with explicit adapter functions or wrapper types.

Deliverables:

- Axum adapter module
- Tungstenite adapter module
- Adapter-level tests for message and close-frame roundtrips

Exit criteria:

- The core protocol and crypto layers compile without `axum` and `tungstenite`.

### Phase 4: Replace generic signed socket surface

Goals:

- Replace the current public `SignedWebSocket<S>` mental model with a high-level signed relay socket concept.
- Keep transport-specific construction at the edges only.

Deliverables:

- `SignedRelaySocket`
- Concrete constructors for axum and tungstenite use cases

Exit criteria:

- Normal application code no longer mentions transport generic bounds to interact with signed relay sockets.

### Phase 5: Split message and tunnel use cases

Goals:

- Create a tunnel-specific API that returns byte-oriented IO directly.
- Remove transport message adaptation from tunnel call sites.
- Make the tunnel signing path directly traceable from the tunnel entrypoint to the signer and verifier.

Deliverables:

- `connect_signed_tunnel_io(...)`
- Tunnel-specific integration tests

Exit criteria:

- `crates/desktop-bridge/src/tunnel.rs` no longer needs to compose signed WebSocket wrappers and stream IO adapters manually.
- A reviewer can identify the outbound and inbound signing steps for tunnel traffic without reading generic transport trait impls.

### Phase 6: Simplify server middleware

Goals:

- Reduce `crates/server/src/middleware/signed_ws.rs` to session-resolution logic plus a single signed-socket wrapper step.

Deliverables:

- Middleware code that depends only on the high-level socket API
- Reduced import surface

Exit criteria:

- The middleware becomes about request policy, not transport mechanics.

### Phase 7: Delete the remaining public generic core

Goals:

- Remove `SignedRelaySocket<S, A>` and `RelayTransportAdapter` from the public mental model.
- Replace them with concrete use-case APIs.

Deliverables:

- Concrete client/server/tunnel entrypoints
- Private transport-specific implementations as needed

Exit criteria:

- No route or client code imports transport-generic relay socket types.

### Phase 8: Split signed and plain server upgrade paths

Goals:

- Remove `MaybeSignedWebSocket`.
- Stop mixing plain and signed websocket flows in one wrapper type.

Deliverables:

- Dedicated signed websocket upgrade path
- Dedicated signed tunnel upgrade path
- Plain websocket routes continue to use normal Axum websocket handling

Exit criteria:

- Server route code no longer branches on a plain-vs-signed websocket wrapper.

### Phase 9: Centralise signed client bootstrap

Goals:

- Move request signing headers, websocket handshake, and relay session crypto construction behind one client API.

Deliverables:

- `connect_signed_relay_websocket(...)`
- `RelayTunnelClient::connect(...)`

Exit criteria:

- Desktop bridge and relay client call sites no longer build signed websocket setup manually.

### Phase 10: Replace route-local bridge loops

Goals:

- Hide websocket bridge loops behind named helpers.

Deliverables:

- `bridge_axum_client_to_signed_upstream(...)`
- Similar helpers for any other recurring route bridges

Exit criteria:

- Route handlers read as request policy and lifecycle management rather than message shuttling.

### Phase 11: Split crates by ownership boundary

Goals:

- Turn the module split into crate-level ownership boundaries.

Deliverables:

- New protocol/crypto/client/server crates
- Updated dependency graph

Exit criteria:

- Transport-specific dependencies no longer appear in crates that only need protocol or crypto.

### Phase 12: Optional protocol v2 evaluation

Goals:

- Decide whether the relay envelope should remain JSON plus base64 or move to a binary format.

Deliverables:

- Explicit decision record
- If approved, a versioned protocol migration plan

Exit criteria:

- Protocol format remains an explicit product decision, not an incidental byproduct of refactoring.

### Phase 13: Separate upgrade authentication from frame authentication

Goals:

- Pull websocket upgrade request signing into its own explicit subsystem.
- Remove direct request-signature construction from websocket and tunnel call sites.

Deliverables:

- `request_auth` module or crate
- session-level upgrade request builder API

Exit criteria:

- A reader can understand websocket upgrade authentication without reading any frame-signing code.

### Phase 14: Introduce `RelaySession`

Goals:

- Replace scattered client bootstrap helpers with one product-facing session object.

Deliverables:

- `RelaySession::connect_socket(...)`
- `RelaySession::connect_tunnel(...)`

Exit criteria:

- Application code no longer assembles relay websocket bootstrap from lower-level pieces.

### Phase 15: Split tunnel and socket runtimes completely

Goals:

- Stop deriving tunnel behaviour from the message-oriented websocket runtime.
- Give tunnel code first-class, byte-oriented naming.

Deliverables:

- dedicated client tunnel runtime
- dedicated server tunnel runtime
- named chunk-signing helpers

Exit criteria:

- The tunnel path is readable entirely in terms of bytes, signed chunks, and websocket transport.

### Phase 16: Hide frame-signing implementation types

Goals:

- Remove public `RelaySessionCrypto`
- Remove public sender/receiver split types

Deliverables:

- internal-only frame auth state
- simplified public socket and tunnel types

Exit criteria:

- App-facing APIs expose only product concepts, not relay-plumbing concepts.

### Phase 17: Simplify server upgrades to product entrypoints

Goals:

- Replace generic upgrade wrappers with direct product entrypoints.

Deliverables:

- `RelayWsUpgrade::on_socket(...)`
- `RelayWsUpgrade::on_tunnel(...)`

Exit criteria:

- Server route code reads as pure policy plus one lifecycle callback.

### Phase 18: Optional binary-only signed channel

Goals:

- Evaluate whether the signed relay websocket protocol should become binary-only.

Deliverables:

- explicit decision record
- if approved, protocol v3 wire spec and migration plan

Exit criteria:

- The relay websocket protocol is either intentionally preserved or intentionally simplified, with no accidental middle state.

## File-By-File Execution Map

This section translates the cleanup wave into a single-change implementation checklist.

### 1. Define the new concrete public APIs first

Files to add:

- `crates/relay-ws-client/src/lib.rs`
- `crates/relay-ws-server/src/lib.rs`
- optionally `crates/relay-ws-bridge/src/lib.rs`

Responsibilities:

- `relay-ws-client` owns concrete tungstenite-facing connect/bootstrap entrypoints.
- `relay-ws-server` owns concrete axum-facing upgrade/extractor entrypoints.
- `relay-ws-bridge` owns named websocket/tunnel bridge helpers if keeping them separate improves readability.

Concrete APIs to introduce:

- `RelayTunnelClient::connect(...) -> RelayTunnelStream`
- `connect_signed_relay_websocket(...)`
- `RelayServerUpgrade::into_signed_socket(...)`
- `RelayServerUpgrade::into_signed_tunnel(...)`
- `bridge_axum_client_to_signed_upstream(...)`

Cutover rule:

- Do not preserve `SignedRelaySocket<S, A>` as a public fallback.

### 2. Move protocol and crypto to stable ownership boundaries

Files to move or split:

- `crates/relay-control/src/signed_ws/protocol.rs`
- `crates/relay-control/src/signed_ws/crypto.rs`

Target ownership:

- `crates/relay-ws-protocol/src/lib.rs`
- `crates/relay-ws-crypto/src/lib.rs`

Responsibilities:

- `relay-ws-protocol` exports `RelayMessage`, `RelayClose`, `SignedRelayEnvelope`, `RelayMessageType`
- `relay-ws-crypto` exports `RelaySessionCrypto`, `OutboundRelaySigner`, `InboundRelayVerifier`

Cutover rule:

- Any protocol/crypto code left in `relay-control` after the change should only be re-export glue if strictly necessary, and ideally not even that.

### 3. Replace the current transport-generic socket layer

Files to delete or radically shrink:

- `crates/relay-control/src/signed_ws/socket.rs`
- `crates/relay-control/src/signed_ws/transport/mod.rs`
- `crates/relay-control/src/signed_ws/transport/axum.rs`
- `crates/relay-control/src/signed_ws/transport/tungstenite.rs`

Replacement shape:

- Private axum implementation under `relay-ws-server`
- Private tungstenite implementation under `relay-ws-client`
- No public `RelayTransportAdapter`
- No public split sender/receiver types

Cutover rule:

- Delete the old transport-generic public surface in the same commit that switches all callers.

### 4. Replace the current tunnel implementation with concrete tunnel types

Files to replace:

- `crates/relay-control/src/signed_ws/tunnel.rs`
- `crates/desktop-bridge/src/tunnel.rs`
- `crates/server/src/routes/ssh_session.rs`

Target shape:

- desktop bridge calls `RelayTunnelClient::connect(...)`
- server tunnel routes call `RelayServerUpgrade::into_signed_tunnel(...)`
- tunnel readers and writers are concrete stream types, not wrappers over a public generic socket abstraction

Cutover rule:

- The tunnel path must stay directly traceable:
  - bytes in
  - `RelayMessage::Binary`
  - signer
  - encoded envelope
  - transport write

### 5. Replace mixed plain/signed server middleware

Files to replace:

- `crates/server/src/middleware/signed_ws.rs`

Target shape:

- one signed upgrade path for message-oriented signed sockets
- one signed upgrade path for tunnel IO
- plain websocket routes continue to use ordinary Axum websocket handling

Files to update:

- `crates/server/src/routes/ssh_session.rs`
- `crates/server/src/routes/approvals.rs`
- `crates/server/src/routes/terminal.rs`
- `crates/server/src/routes/config.rs`
- `crates/server/src/routes/scratch.rs`
- `crates/server/src/routes/execution_processes.rs`
- `crates/server/src/routes/workspaces/streams.rs`

Cutover rule:

- Delete `MaybeSignedWebSocket` in the same change. Do not preserve it as an adapter type.

### 6. Centralise client bootstrap

Files to replace:

- `crates/relay-client/src/lib.rs`
- `crates/desktop-bridge/src/tunnel.rs`

Potential supporting files:

- a new client bootstrap module under `crates/relay-ws-client/src/`

Responsibilities:

- request signature headers
- websocket request construction
- websocket connect
- `RelaySessionCrypto` construction
- return either a concrete signed websocket client or a concrete tunnel stream

Cutover rule:

- Client callsites should stop manually assembling signed websocket setup.

### 7. Hide route-local bridge loops behind named helpers

Files to replace:

- `crates/server/src/routes/host_relay/proxy.rs`

Potential new files:

- `crates/relay-ws-bridge/src/proxy.rs`
- or `crates/relay-ws-server/src/bridge.rs`

Responsibilities:

- bridge axum websocket clients to signed upstream relay sockets
- encapsulate message conversion and shutdown rules

Cutover rule:

- Route handlers should not contain bespoke frame-shuttling loops after the cleanup wave.

### 8. Remove obsolete relay-control surface entirely

Files to delete or reduce to re-export glue:

- `crates/relay-control/src/signed_ws/mod.rs`
- any leftover `relay-control` signed websocket files after crate extraction

Target shape:

- `relay-control` should not remain the home of the signed websocket architecture once the dedicated crates exist

Cutover rule:

- Delete obsolete modules instead of preserving shim layers.

### 9. Update dependency graph in one pass

Files to update:

- `crates/desktop-bridge/Cargo.toml`
- `crates/relay-client/Cargo.toml`
- `crates/server/Cargo.toml`
- `crates/relay-hosts/Cargo.toml`
- `crates/deployment/Cargo.toml`
- `crates/local-deployment/Cargo.toml`
- `crates/embedded-ssh/Cargo.toml`
- workspace manifests as needed

Responsibilities:

- remove old `relay-control` signed websocket feature coupling
- point crates at the new protocol/crypto/client/server crates

Cutover rule:

- Dependency changes should land in the same branch as the code cutover. No dual-dependency period.

### 10. Optional protocol v2 decision happens after the cleanup branch, not during it

Files potentially affected later:

- protocol crate files
- any TS or cross-language relay protocol docs/tests

Cutover rule:

- Do not mix protocol-v2 wire changes into the same branch as the final readability cleanup unless explicitly approved as one combined migration.

## Migration Order

Use this order to structure the branch, but merge only once the full sequence is complete:

1. Add new protocol types beside the existing implementation.
2. Move signing logic behind those new types.
3. Add transport adapters.
4. Switch all call sites in the same branch.
5. Delete obsolete generic helper surface.
6. Introduce tunnel-specific IO API and remove manual composition at call sites.

For the final cleanup wave, use this order:

1. Design concrete client/server/tunnel APIs first.
2. Move remaining route and client call sites to those concrete APIs.
3. Delete public generic relay socket abstractions.
4. Split plain and signed server upgrade paths.
5. Extract route bridge helpers.
6. Split crates once the public API shape is stable.
7. Evaluate protocol v2 only after the API and ownership boundaries are settled.

For execution discipline, treat steps 1 through 6 as one inseparable change set:

- do not merge partial progress
- do not keep compatibility wrappers between steps
- do not leave deleted abstractions available behind aliases or re-exports

This order keeps implementation work understandable while still ending in a single all-at-once cutover.

## Testing Strategy

### Unit tests

- Envelope encode and decode
- Sequence enforcement
- Signature verification failure paths
- Text, binary, ping, pong, and close conversions

### Integration tests

- Signed axum server to tungstenite client roundtrip
- Signed tungstenite client to axum server roundtrip
- Tunnel byte stream roundtrip over signed WebSocket
- Tunnel traceability test coverage that exercises outbound signing and inbound verification through the dedicated tunnel API
- Concrete client bootstrap tests that assert headers, nonce, session crypto, and websocket connect are created by one entrypoint
- Route-level bridge helper tests so proxy routes no longer rely on ad hoc loops for correctness

### Regression tests

- Rotated signing session replacement
- Invalid nonce rejection
- Invalid peer key rejection
- Close-frame propagation and clean shutdown

## Risks

- Refactoring boundaries without changing behaviour will require disciplined staging.
- Transport close-frame behaviour may differ subtly between libraries and can regress if moved too quickly.
- Tunnel flows may rely on implicit message-shape assumptions that are currently hidden by the generic wrapper.
- Paying duplication cost to improve readability may feel inefficient and will need discipline to keep the duplicated paths aligned.
- Splitting crates too early can create churn if the final public API shape is not stable first.

## Risk Controls

- Preserve wire format exactly until protocol tests prove equivalence.
- Add golden tests for signed envelope bytes before moving code.
- Keep the old and new code paths isolated within the branch, then remove the old path before merge.
- Verify tunnel behaviour with byte-stream integration tests before deleting old adapters.
- Prefer deleting public generics only after concrete replacement APIs exist and are exercised by integration tests.
- Delay crate splitting until the final-form API has proven stable at call sites.

## Non-Goals

- Replacing tungstenite or axum as libraries
- Changing the relay signing algorithm
- Changing the wire envelope format during the readability cleanup unless protocol v2 is explicitly approved
- Chasing generic reuse as an end in itself

## Review Of This Plan

This plan is intentionally more ambitious than the small API cleanup already completed.

Strengths:

- It attacks the real readability problem, which is boundary placement.
- It gives us an end state where most application code is transport-agnostic.
- It creates a clean place for protocol and crypto tests.
- It makes the tunnel signing path an explicit design target rather than an emergent property of generic wrappers.

Costs:

- This is a real architecture refactor, not a light cleanup.
- It will touch multiple crates and several integration points.
- A hard cutover increases merge and review complexity because all integrations must land together.

Recommendation:

- Treat the landed hard cutover as the midpoint, not the endpoint.
- Use a second cleanup wave to remove the remaining public generic abstractions.
- Prefer concrete use-case APIs over elegant reusable internals.

## Proposed Execution Shape

For the next cleanup wave, the implementation should do all of this before merge:

- Design the concrete client/server/tunnel APIs first.
- Move server, relay client, desktop bridge, and proxy routes to those APIs.
- Delete `SignedRelaySocket<S, A>`, `RelayTransportAdapter`, and `MaybeSignedWebSocket` from the public surface.
- Introduce named bridge helpers for recurring route websocket bridging.
- Split crates once the new API shape has proven stable.
- Only then decide whether protocol v2 is worth pursuing.

This shape deliberately spends implementation effort to buy down reader confusion. That is the right trade if clarity is the top priority.

It should be executed as one hard cutover with no backwards compatibility.

## Approval Gate

Do not begin the final cleanup wave until this updated plan is explicitly approved.
