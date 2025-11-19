# Amplitude Event Dictionary

This document serves as the authoritative source for all Amplitude events tracked in the Archety Edge system. Keep this updated whenever events or properties are added, modified, or removed.

**Last Updated:** 2025-11-19

---

## Table of Contents

1. [User Properties](#user-properties)
2. [System Lifecycle Events](#system-lifecycle-events)
3. [Message Events](#message-events)
4. [Backend Communication Events](#backend-communication-events)
5. [WebSocket Events](#websocket-events)
6. [Command Events](#command-events)
7. [Scheduled Message Events](#scheduled-message-events)
8. [Photo Upload Events](#photo-upload-events)
9. [Context & Plans Events](#context--plans-events)
10. [Admin Portal Events](#admin-portal-events)
11. [Native Bridge Events](#native-bridge-events)
12. [Performance & Health Events](#performance--health-events)
13. [Error Events](#error-events)

---

## User Properties

User properties are persistent attributes that describe the edge agent and its configuration.

| Property | Type | Description |
|----------|------|-------------|
| `agent_id` | string | Unique identifier for this edge agent (e.g., "edge_3238407486") |
| `user_phone` | string | Phone number of the iMessage account |
| `backend_url` | string | URL of the backend server |
| `websocket_enabled` | boolean | Whether WebSocket is enabled for real-time commands |
| `adaptive_mode` | boolean | Whether adaptive scheduling is enabled |
| `node_version` | string | Node.js version running the agent |
| `platform` | string | Operating system platform (e.g., "darwin" for macOS) |
| `total_messages_received` | number | Cumulative count of messages received |
| `total_messages_sent` | number | Cumulative count of messages sent successfully |
| `total_messages_failed` | number | Cumulative count of messages that failed to send |
| `total_scheduled_messages` | number | Cumulative count of messages scheduled |
| `scheduled_messages_sent` | number | Cumulative count of scheduled messages sent |
| `scheduled_messages_failed` | number | Cumulative count of scheduled messages that failed |
| `websocket_connections` | number | Cumulative count of WebSocket connections established |
| `websocket_failures` | number | Cumulative count of WebSocket connection failures |
| `total_errors` | number | Cumulative count of errors |
| `total_photos_uploaded` | number | Cumulative count of photos uploaded |
| `total_photo_upload_failures` | number | Cumulative count of photo upload failures |
| `total_backend_failures` | number | Cumulative count of backend request failures |
| `total_plans_created` | number | Cumulative count of conversation plans created |
| `total_contexts_created` | number | Cumulative count of mini-app contexts created |
| `admin_portal_accesses` | number | Cumulative count of admin portal accesses |
| `native_bridge_starts` | number | Cumulative count of native bridge starts |

---

## System Lifecycle Events

### `agent_started`

Fired when the edge agent successfully starts up.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `agent_id` | string | Yes | Unique identifier for this edge agent |
| `user_phone` | string | Yes | Phone number of the iMessage account |
| `backend_url` | string | Yes | URL of the backend server |
| `websocket_enabled` | boolean | Yes | Whether WebSocket is enabled |
| `adaptive_mode` | boolean | Yes | Whether adaptive scheduling is enabled |
| `node_version` | string | Yes | Node.js version |
| `platform` | string | Yes | Operating system platform |

### `agent_stopped`

Fired when the edge agent is gracefully shut down.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `agent_id` | string | Yes | Unique identifier for this edge agent |

---

## Message Events

### `message_received`

Fired when a new message is received from iMessage.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `thread_id` | string | Yes | iMessage thread identifier (chat GUID) |
| `is_group` | boolean | Yes | Whether this is a group chat |
| `has_attachments` | boolean | Yes | Whether the message includes attachments |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** Every incoming iMessage message

**User Property Updates:**
- Increments `total_messages_received`

### `message_sent`

Fired when a message is sent via iMessage transport.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `thread_id` | string | Yes | iMessage thread identifier (chat GUID) |
| `is_group` | boolean | Yes | Whether this is a group chat |
| `bubble_type` | string | Yes | Type of message: "reflex", "burst", "single", "multi" |
| `success` | boolean | Yes | Whether the message was sent successfully |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** After attempting to send a message via AppleScript

**User Property Updates:**
- Increments `total_messages_sent` if success=true
- Increments `total_messages_failed` if success=false

---

## Backend Communication Events

### `backend_request_started`

Fired when a request to the backend is initiated.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `endpoint` | string | Yes | API endpoint (e.g., "/edge/message", "/photo/upload") |
| `request_id` | string | Yes | Unique identifier for this request |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in RailwayClient.

### `backend_request_completed`

Fired when a backend request completes successfully.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `endpoint` | string | Yes | API endpoint |
| `request_id` | string | Yes | Unique identifier for this request |
| `status_code` | number | Yes | HTTP response status code |
| `latency_ms` | number | Yes | Request duration in milliseconds |
| `retry_count` | number | Yes | Number of retries (0 if first attempt succeeded) |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in RailwayClient.

### `backend_request_failed`

Fired when a backend request fails after all retries.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `endpoint` | string | Yes | API endpoint |
| `request_id` | string | Yes | Unique identifier for this request |
| `error_type` | string | Yes | Type of error (e.g., "ECONNRESET", "timeout", "401") |
| `status_code` | number | No | HTTP response status code (if available) |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**User Property Updates:**
- Increments `total_backend_failures`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in RailwayClient.

---

## WebSocket Events

### `websocket_status`

Fired when the WebSocket connection status changes.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `status` | string | Yes | Connection status: "connected", "disconnected", "reconnecting", "failed" |
| `backend_url` | string | Yes | WebSocket server URL |
| `error` | string | No | Error message (for "failed" status) |
| `reconnect_attempt` | number | No | Reconnection attempt number (for "reconnecting" status) |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:**
- WebSocket connection established (status="connected")
- WebSocket disconnected (status="disconnected")
- WebSocket connection failed (status="failed")

**User Property Updates:**
- Increments `websocket_connections` when status="connected"
- Increments `websocket_failures` when status="failed"

---

## Command Events

### `command_processed`

Fired when a command from the backend is executed.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `command_type` | string | Yes | Type of command (e.g., "schedule_message", "send_message_now", "upload_retry", "emit_event") |
| `command_id` | string | No | Unique identifier for the command |
| `success` | boolean | Yes | Whether the command executed successfully |
| `duration_ms` | number | Yes | Command execution duration in milliseconds |
| `priority` | string | No | Command priority ("immediate" or "normal") |
| `source` | string | No | Command source ("websocket" or "http") |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** After executing any command from the backend

**User Property Updates:**
- Increments `commands_{command_type}_processed`

---

## Scheduled Message Events

### `message_scheduled`

Fired when a message is scheduled for future delivery.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `schedule_id` | string | No | UUID of the scheduled message |
| `thread_id` | string | No | iMessage thread identifier |
| `send_at` | string | Yes | ISO 8601 timestamp when message should be sent |
| `is_group` | boolean | No | Whether this is a group chat |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When a new message is added to the scheduler

**User Property Updates:**
- Increments `total_scheduled_messages`

### `message_schedule_executed`

Fired when a scheduled message is sent (or attempted).

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `schedule_id` | number | Yes | Numeric ID derived from the schedule UUID |
| `scheduled_time` | string | Yes | ISO 8601 timestamp when message was scheduled to send |
| `actual_time` | string | Yes | ISO 8601 timestamp when message was actually sent |
| `latency_ms` | number | Yes | Difference between actual and scheduled time in milliseconds |
| `success` | boolean | Yes | Whether the message was sent successfully |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When a scheduled message is executed by the scheduler

**User Property Updates:**
- Increments `scheduled_messages_sent` if success=true
- Increments `scheduled_messages_failed` if success=false

---

## Photo Upload Events

### `photo_upload_started`

Fired when a photo upload begins.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `attachment_guid` | string | Yes | iMessage attachment GUID |
| `mime_type` | string | Yes | MIME type of the attachment (e.g., "image/jpeg") |
| `size_bytes` | number | Yes | File size in bytes |
| `thread_id` | string | Yes | iMessage thread identifier |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** Before uploading a photo to the backend

### `photo_upload_completed`

Fired when a photo upload completes successfully.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `attachment_guid` | string | Yes | iMessage attachment GUID |
| `photo_id` | string | Yes | Backend-assigned photo ID |
| `size_bytes` | number | Yes | File size in bytes |
| `upload_duration_ms` | number | Yes | Upload duration in milliseconds |
| `transcoded` | boolean | Yes | Whether the photo was transcoded by the backend |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** After successful photo upload to the backend

**User Property Updates:**
- Increments `total_photos_uploaded`

### `photo_upload_failed`

Fired when a photo upload fails.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `attachment_guid` | string | Yes | iMessage attachment GUID |
| `error_reason` | string | Yes | Error message describing the failure |
| `size_bytes` | number | Yes | File size in bytes |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When photo upload to backend fails

**User Property Updates:**
- Increments `total_photo_upload_failures`

---

## Context & Plans Events

### `context_created`

Fired when a mini-app context is created.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `chat_guid` | string | Yes | iMessage thread identifier |
| `app_id` | string | Yes | Mini-app identifier |
| `room_id` | string | Yes | Room identifier for the mini-app session |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When a mini-app is activated for a conversation

**User Property Updates:**
- Increments `total_contexts_created`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in ContextManager.

### `context_completed`

Fired when a mini-app context is completed.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `chat_guid` | string | Yes | iMessage thread identifier |
| `app_id` | string | Yes | Mini-app identifier |
| `duration_seconds` | number | Yes | Duration of the context session |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When a mini-app session ends normally

**User Property Updates:**
- Increments `total_contexts_completed`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in ContextManager.

### `context_cleared`

Fired when a mini-app context is manually cleared.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `chat_guid` | string | Yes | iMessage thread identifier |
| `reason` | string | Yes | Reason for clearing (e.g., "user_request", "timeout") |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When a context is manually cleared or times out

**User Property Updates:**
- Increments `total_contexts_cleared`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in ContextManager.

### `plan_created`

Fired when a conversation plan is created.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `thread_id` | string | Yes | iMessage thread identifier |
| `plan_type` | string | Yes | Type of plan |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When a new conversation plan is created

**User Property Updates:**
- Increments `total_plans_created`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in PlanManager.

### `plan_updated`

Fired when a conversation plan is updated.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `thread_id` | string | Yes | iMessage thread identifier |
| `version` | number | Yes | Plan version number |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When an existing plan is modified

**User Property Updates:**
- Increments `total_plan_updates`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in PlanManager.

### `rule_executed`

Fired when an automation rule is evaluated.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `rule_type` | string | Yes | Type of rule |
| `rule_name` | string | Yes | Name of the rule |
| `matched` | boolean | Yes | Whether the rule conditions matched |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When a rule is evaluated

**User Property Updates:**
- Increments `rules_{rule_type}_matched` if matched=true

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in RuleEngine.

---

## Admin Portal Events

### `admin_portal_accessed`

Fired when the admin portal is accessed.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `page` | string | Yes | Page or route accessed |
| `user_ip` | string | Yes | Masked IP address (last octet only) |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When admin portal pages are accessed

**User Property Updates:**
- Increments `admin_portal_accesses`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in AdminServer.

### `admin_config_updated`

Fired when configuration is updated via admin portal.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `fields_changed` | string[] | Yes | Array of configuration field names that were changed |
| `fields_count` | number | Yes | Number of fields changed |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When configuration is saved via admin portal

**User Property Updates:**
- Increments `admin_config_updates`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in AdminServer.

### `admin_service_restarted`

Fired when the edge agent is restarted via admin portal.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When restart is initiated from admin portal

**User Property Updates:**
- Increments `admin_service_restarts`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in AdminServer.

### `admin_test_message_sent`

Fired when a test message is sent via admin portal.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `thread_id` | string | Yes | iMessage thread identifier |
| `success` | boolean | Yes | Whether the message was sent successfully |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When test message is sent from admin portal

**User Property Updates:**
- Increments `admin_test_messages_sent` if success=true

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in AdminServer.

---

## Native Bridge Events

### `native_bridge_started`

Fired when the native Swift bridge process starts.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When messages-helper native process is launched

**User Property Updates:**
- Increments `native_bridge_starts`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in NativeBridgeTransport.

### `native_bridge_message_received`

Fired when messages are received from the native bridge.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message_count` | number | Yes | Number of messages in this event |
| `batch_size` | number | Yes | Size of the batch received |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When native bridge sends message data to Node.js

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in NativeBridgeTransport.

### `native_bridge_error`

Fired when the native bridge encounters an error.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `error_type` | string | Yes | Type of error |
| `error_message` | string | Yes | Error message |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When native bridge process errors occur

**User Property Updates:**
- Increments `native_bridge_errors`

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in NativeBridgeTransport.

### `applescript_execution`

Fired when an AppleScript command is executed.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `operation` | string | Yes | Operation type (e.g., "send_message", "send_multi_bubble") |
| `success` | boolean | Yes | Whether the operation succeeded |
| `duration_ms` | number | Yes | Execution duration in milliseconds |
| `bubble_count` | number | No | Number of bubbles sent (for multi-bubble operations) |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When AppleScript is used to send messages

**User Property Updates:**
- Increments `applescript_{operation}_success` if success=true
- Increments `applescript_{operation}_failed` if success=false

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented in AppleScriptSender.

---

## Performance & Health Events

### `agent_uptime`

Fired periodically to report agent health and statistics.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `uptime_seconds` | number | Yes | Seconds since agent started |
| `uptime_hours` | number | Yes | Hours since agent started |
| `messagesReceived` | number | Yes | Total messages received in this session |
| `messagesSent` | number | Yes | Total messages sent in this session |
| `commandsProcessed` | number | Yes | Total commands processed in this session |
| `scheduledMessages` | number | Yes | Number of pending scheduled messages |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** Called periodically (recommended: every 5-15 minutes)

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented.

### `performance_metrics`

Fired periodically to report system performance metrics.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `memoryUsageMB` | number | Yes | Memory usage in megabytes |
| `cpuPercent` | number | Yes | CPU usage percentage |
| `activeTimers` | number | Yes | Number of active setTimeout timers |
| `activeIntervals` | number | Yes | Number of active setInterval timers |
| `wsMessageTracked` | number | Yes | Number of WebSocket messages tracked |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** Called periodically (recommended: every 5-15 minutes)

**Note:** Currently defined in AmplitudeAnalytics but not yet instrumented.

---

## Error Events

### `error_occurred`

Fired when an error occurs in any component.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `error_type` | string | Yes | Type/category of error (e.g., "message_processing", "command_processing") |
| `error_message` | string | Yes | Error message text |
| `component` | string | No | Component where error occurred (e.g., "EdgeAgent.processMessage") |
| `context` | object | No | Additional context properties specific to the error |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event |

**Triggers:** When errors are caught in try-catch blocks

**User Property Updates:**
- Increments `total_errors`
- Increments `errors_{error_type}`

---

## Implementation Status

### ✅ Fully Instrumented
- `agent_started`
- `agent_stopped`
- `message_received`
- `message_sent`
- `websocket_status`
- `command_processed`
- `message_scheduled`
- `message_schedule_executed`
- `photo_upload_started`
- `photo_upload_completed`
- `photo_upload_failed`
- `error_occurred`

### ⚠️ Partially Instrumented
- `feature_usage` (method exists, not called)

### ❌ Not Yet Instrumented
- `backend_request_started`
- `backend_request_completed`
- `backend_request_failed`
- `context_created`
- `context_completed`
- `context_cleared`
- `plan_created`
- `plan_updated`
- `rule_executed`
- `admin_portal_accessed`
- `admin_config_updated`
- `admin_service_restarted`
- `admin_test_message_sent`
- `native_bridge_started`
- `native_bridge_message_received`
- `native_bridge_error`
- `applescript_execution`
- `agent_uptime`
- `performance_metrics`

---

## Key Dashboards & Metrics

### Real-time Health Dashboard
- **Messages/minute**: Rate of `message_received` and `message_sent` events
- **WebSocket Status**: Latest `websocket_status` event
- **Command Processing**: Rate and success rate of `command_processed` events
- **Backend Latency**: P50, P95, P99 of `backend_request_completed.latency_ms`

### Reliability Dashboard
- **Message Delivery Success Rate**: `message_sent.success=true` / total `message_sent`
- **Photo Upload Success Rate**: `photo_upload_completed` / (`photo_upload_completed` + `photo_upload_failed`)
- **Scheduled Message Accuracy**: Distribution of `message_schedule_executed.latency_ms`
- **Error Rate by Component**: Count of `error_occurred` grouped by `error_type`

### Usage Dashboard
- **Active Threads**: Unique `thread_id` values in `message_received`
- **Group vs 1:1 Ratio**: `is_group=true` vs `is_group=false` in `message_received`
- **Message Types**: Distribution of `bubble_type` in `message_sent`
- **Mini-App Adoption**: Count of `context_created` by `app_id`

---

## Notes

- All events automatically include `agent_id` and `timestamp` properties
- All user properties are cumulative and persist across agent restarts
- Timestamps are in ISO 8601 format (UTC)
- The Amplitude API key should be set via the `AMPLITUDE_API_KEY` environment variable
- Events are batched and flushed every 10 seconds by default (configurable via `flush_interval_ms` in config.yaml)

---

## Maintenance Guidelines

When adding new events:
1. Add the event method to `src/monitoring/amplitude.ts`
2. Instrument the event at the appropriate location(s) in the codebase
3. Update this document with the event name, properties, triggers, and user property updates
4. Update the Implementation Status section
5. Consider whether the event should be added to any dashboards

When modifying events:
1. Update the method signature in `src/monitoring/amplitude.ts`
2. Update all call sites
3. Update this document
4. Consider backward compatibility for existing dashboards
