## Edge Client Architecture Plan (Nov 18 2025)

### Purpose
Align the Mac mini edge agent with the latest PRD/Engineering spec so it can act as a multi-app execution platform for iMessage. This document captures the implementation path already started in this branch plus the remaining steps to reach the MVP+ phases.

### Current Progress
- Introduced a persistent `ContextManager` (SQLite-backed) that tracks mini-app state per `chat_guid`.
- Added attachment discovery by reading the Messages attachments table and resolving absolute paths.
- Added an `AttachmentProcessor` that normalizes photo metadata, enforces 5 MB limits, and streams uploads to `/photos/upload` with context metadata.
- Extended backend contracts (`/edge/message`, `/photos/upload`) to carry context + attachment summaries so orchestration can make multi-app decisions.
- Introduced a native Swift helper (`native/messages-helper`) that tails the Messages database and surfaces participants/attachments over a JSON IPC stream, giving us lower latency than AppleScript polling and unblocking attachment workflows.
- Encrypted `edge-state.db` with an AES-256-GCM payload (keys issued from macOS Keychain) so mini-app context stays encrypted at rest.
- Added a HEIC/large-photo transcoding pipeline using `sharp` to keep uploads under 5 MB and standardize on JPEG for MVP.
- Created an encrypted `AttachmentCache` (shares the same state DB) to persist GUID→file metadata, enabling backend-driven `upload_retry` commands without re-ingesting the original message.
- Implemented backend command handlers for `context_update`, `context_reset`, `upload_retry`, and `emit_event`, keeping mini-app state aligned with new orchestration flows.

### Architecture Additions
1. **Event Pipeline**
   - `MessagesDB` emits structured events with participants, attachments, and optional context.
   - `EdgeAgent` enriches each event with context + attachment metadata before sending to backend and/or photo service.
   - Future work: wrap transport, attachment, backend calls in an internal event bus to isolate slow components and allow back-pressure.

2. **Context Service**
   - SQLite table `chat_contexts` persists `{chat_guid → app_id, room_id, state, metadata}`.
   - APIs: `upsert`, `complete`, `list`, and `clear`.
   - Short-term: update/clear contexts from backend commands.
   - Longer-term: add TTL + conflict-resolution (per mini-app).

3. **Attachment / Photo Service**
   - Attachment metadata now captured at ingest.
   - Photo uploads run before `/edge/message` to reduce backend round-trips.
   - Attachment cache stores GUID/file metadata + context snapshots so we can safely honor backend `upload_retry` commands even after the original message window closes.
   - Next steps:
     - add HEIC → JPEG conversion/compression (e.g., `sharp`, `libheif`).
     - queue uploads when offline and retry.
     - encrypt temp files at rest.

4. **Backend Contract Updates**
   - All message requests may include `context` + `attachments`.
   - Backend responses may include `mini_app_triggered`, `room_id`, `context_metadata`, and command arrays.
   - Need backend changes (see separate suggestions doc) to honor these fields.

### Remaining Work
| Area | Tasks |
| --- | --- |
| Multi-App Context | consume backend commands to switch/clear contexts; add admin inspection in portal *(context_update/context_reset already wired locally)* |
| Message Queue | persist outbound/inbound queue for offline guarantees; reuse SQLite (`edge-state.db`) |
| Observability | emit metrics for attachment latency, context churn, queue depth; extend `/health` |
| Privacy/Security | extend encryption to scheduler/rule stores, enforce auto-rotation of Keychain secrets, redact logs |
| Scheduling | reuse context metadata when backend schedules commands (tie `room_id` to local queue) |

### Blocking Questions
1. Are we green-lit to ship the Messages private API helper (instead of AppleScript) for attachments + participant deltas before MVP?
2. Can backend expose a `context_reset` command (with reason) so the edge knows when to clear state?
3. Where should we persist encryption keys for the SQLite stores (Keychain vs. file-based KMS)?
4. Do we need HEIC transcoding on-device or can backend handle native HEIC payloads if we send them as-is?

### Next Milestones
1. **Queue + Retry Layer** – wrap outbound HTTP + upload calls with FIFO persistence.
2. **Context-aware Admin Portal** – surface active mini-apps and allow manual reset.
3. **Attachment Service Hardening** – add compression/transcoding, metrics, and background processing.
4. **Swift Bridge Spike** – prototype private API collector to replace polling within SLA.


