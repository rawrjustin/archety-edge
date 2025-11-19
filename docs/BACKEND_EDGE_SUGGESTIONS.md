## Backend Suggestions for Edge-Ready Mini-App Support

### 1. Message Contract Updates
- **Context Awareness**
  - Accept `context.active_miniapp`, `context.room_id`, `context.state`, and `context.metadata` on `/edge/message`.
  - Use `context` to route intents to the correct mini-app room; respond with `mini_app_triggered`, `room_id`, and optional `context_metadata`.
  - Emit a new `context_reset` command when the backend decides a room is complete or replaced so the edge can clear local state.
- **Attachment Metadata**
  - Read the `attachments[]` array (guid, mime, size, uploaded_photo_id, skip_reason).
  - Persist GUID↔photo mappings so follow-up orchestration (bill split, trip planner) can fetch photo analysis results without re-upload.

### 2. Photo Upload Endpoint
- Support Bearer-authenticated calls with optional `context` payload (mini-app + room).
- Return `photo_id`, `photo_url`, and optional `analysis`/`event` payload as defined in the PRD.
- When `analysis` produces a follow-up action (e.g., `receipt_analyzed`), push a WebSocket command referencing the same `room_id`.
- Provide idempotency by deduping on `(attachment_guid, room_id)` to avoid duplicate billing on replays.

### 3. Command Extensions
- Introduce explicit commands for:
  1. `context_update` – mutate local metadata without forcing a new mini-app.
  2. `context_reset` – instruct edge to clear context (with reason + optional follow-up text for the chat).
  3. `upload_retry` – request the edge to retry/resend a specific attachment GUID if backend processing failed.
- Include `priority` hints (e.g., `immediate`, `deferred`) so the edge scheduler can fast-track critical updates.

### 4. Reliability + Offline Support
- Allow `/edge/message` responses to include a `queue_hint` describing how long the edge should keep unsent items so backend can expect eventual delivery.
- Provide a `/edge/queue/drain` endpoint (or WebSocket command) to acknowledge messages that were processed while the edge was offline, so it can drop redundant retries cleanly.

### 5. Observability Hooks
- Add structured fields in backend logs/metrics for `chat_guid`, `room_id`, `mini_app`, `edge_agent_id`, and `photo_id`.
- Publish metrics needed by the client (`message_latency`, `photo_processing_ms`, `command_backlog`, `context_mismatches`) via `/health` or Prometheus so we can surface them in the on-device dashboard.
- Emit explicit `ack_events` whenever backend-side orchestration completes an edge-scheduled action; the edge now keeps a per-command ledger in SQLite and needs those acks to keep storage bounded.

### 6. Security & Auth
- Enforce Bearer token validation uniformly on `/edge/message`, `/photos/upload`, `/edge/sync`, and future `/edge/queue/*` endpoints.
- Support short-lived edge tokens or token rotation hooks so we can rotate `EDGE_SECRET` every 30 days without downtime.
- When sending commands that include decrypted user data (e.g., receipt OCR), encrypt payloads with the edge’s public key or provide at-rest encryption hints so we can meet the 7-day retention + privacy promises.

### 7. Testing Expectations
- Provide backend fixtures/mocks for:
  - Multi-participant group chats with `participants[]`.
  - Photo upload lifecycle (base64 payload, analysis, mini-app event).
  - Context reset + re-entry flows.
- Coordinate on an integration harness (could be Jest + supertest) that replays captured chat transcripts through `/edge/message` + `/photos/upload` to verify no regressions when new mini-apps are added.

These changes keep backend + edge contracts in sync with the new context + attachment pipeline that just landed in the repo. Once implemented, we can unlock the PRD’s Phase 2/3 requirements (group chats, photos, multi-app context) without further protocol churn.

