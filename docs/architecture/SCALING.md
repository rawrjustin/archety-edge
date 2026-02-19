# Scaling Guide - Edge Relay

## Overview

Each edge relay runs on a Mac mini and bridges iMessage to the Archety backend.
The fundamental unit is: **1 persona = 1 phone number = 1 macOS user account = 1 edge agent process**.
This document explains the outbound rate limit, what constrains capacity, and how to scale when a persona like Sage gets more users than a single node can handle.

---

## Outbound Rate Limit

### Current Limit: 120 messages / minute

Configured in `src/transports/AppleScriptSender.ts`:

```typescript
const allowed = await this.rateLimiter.checkLimit({
  maxRequests: 120,
  windowMs: 60000,
  identifier: 'send_message'
});
```

### Why 120?

Apple does not publish official iMessage rate limits. Empirically:

| Scenario | Observed threshold | Consequence |
|---|---|---|
| Messages to **existing** conversations | ~200-300/hr sustained | None — Apple does not throttle established chats aggressively |
| Messages to **new / unique** contacts | ~100-200/hr | Temporary soft-throttle (messages delayed 30-60s) |
| Sustained high-volume to many recipients | ~500+/hr | Possible account flag — messages silently dropped |

120/min = 7,200/hr at peak, but real-world usage is bursty (e.g. 5 bubbles in 2 seconds, then idle for 30 seconds), so effective sustained throughput is well under Apple's limits for established conversations.

**If you observe Apple throttling** (messages delivered with 30-60s delay, or not delivered at all), lower the limit to 60/min and investigate whether the persona is messaging too many new contacts.

### SendQueue (Backpressure Handling)

When the rate limiter rejects a send, the `SendQueue` (`src/transports/SendQueue.ts`) buffers the message and retries with exponential back-off instead of silently dropping it.

| Parameter | Default | Description |
|---|---|---|
| `maxQueueSize` | 500 | Max buffered messages before new ones are dropped |
| `maxRetries` | 3 | Retry attempts per message |
| `retryBaseDelayMs` | 2000 | Base delay between retries (doubles each attempt: 2s, 4s, 8s) |
| `ttlMs` | 120,000 | Max time a message can wait in queue before expiry |
| `drainIntervalMs` | 200 | How often the queue checks for messages to send |

The queue is in-memory only. If the edge process crashes, queued messages are lost. This is acceptable because the backend can re-issue commands.

---

## Capacity Planning

### Per-Node Capacity

A single Mac mini running one persona can handle:

| Usage pattern | Concurrent active users | Total registered users |
|---|---|---|
| **Heavy** (10+ msgs/day per user) | 15-25 | 50-100 |
| **Moderate** (3-5 msgs/day per user) | 30-50 | 150-300 |
| **Light** (1-2 msgs/day per user) | 50-100 | 300-500 |

"Active" = currently in a conversation exchange (back-and-forth within minutes).

### What Constrains Capacity

1. **Apple iMessage limits** — The hard ceiling. Sending too fast or to too many unique recipients triggers soft throttling or account flagging.
2. **AppleScript overhead** — Each `osascript` invocation takes ~100-150ms. Batched multi-bubble sends reduce this to ~150ms total.
3. **CPU** — Polling the Messages SQLite database, running AppleScript, and processing attachments. A Mac mini M2 handles this easily at <10% CPU under normal load.
4. **Backend latency** — Each incoming message makes an HTTP round-trip to the cloud backend (~200-350ms). Parallel processing (3 concurrent) mitigates this.
5. **macOS user accounts** — Each persona needs a separate macOS user account signed into iMessage with its own Apple ID. A single Mac mini supports up to 6-8 concurrent user sessions via `launchctl` daemons.

### Personas Per Mac Mini

A single Mac mini can run **4-6 personas** simultaneously (each as a separate macOS user + edge agent process). Beyond 6, CPU contention from SQLite polling and AppleScript execution starts to degrade latency.

---

## Hardware Recommendations

### Recommended: Mac mini (Apple Silicon)

| Spec | Budget | Minimum (new) | Recommended | High-Capacity |
|---|---|---|---|---|
| **Chip** | M1 (8-core CPU) | M2 (8-core CPU) | M2 Pro (10-core CPU) | M4 Pro (12-core CPU) |
| **RAM** | 16 GB | 8 GB | 16 GB | 24 GB |
| **Storage** | 256 GB SSD | 256 GB SSD | 512 GB SSD | 512 GB SSD |
| **Personas** | 3-4 | 2-3 | 4-6 | 6-8 |
| **Users (moderate)** | 450-1,200 | 300-900 | 600-1,800 | 900-2,400 |
| **Power** | ~5-7W idle | ~5-10W idle | ~5-10W idle | ~5-10W idle |
| **Price (approx)** | ~$400 refurbished | $599 | $1,199 | $1,599 |

> **Best value pick:** Mac mini M1 16 GB (2020). The edge relay uses <10% CPU and ~200 MB RAM per persona — the M1 is ~90% of M2 single-core performance and the workload doesn't stress multi-core. Buy refurbished for ~$400-450 and run 3-4 personas comfortably. Only go M2+ if buying new.

### Why Mac mini?

- **Smallest Apple Silicon form factor** — fits in a 1U server shelf or closet
- **Low power** — 5-10W idle, no fans under edge relay workload
- **Always-on macOS** — required for Messages.app and AppleScript
- **Apple Silicon performance** — M1/M2/M4 all handle 4+ concurrent edge processes with headroom
- **Ethernet + Wi-Fi** — reliable network connectivity
- **Thunderbolt** — can connect external drives for attachment storage if needed

### Not Recommended

| Hardware | Why Not |
|---|---|
| **MacBook** | Screen must stay open, battery degrades, fans spin up |
| **Mac Studio** | Overkill — same M2/M4 chip but 2-3x the price |
| **Mac Pro** | Extremely overkill and expensive |
| **Hackintosh / VM** | iMessage activation unreliable, Apple may block |
| **Intel Macs** | End of life, higher power draw, worse perf/watt |

### Hosting Options

| Option | Pros | Cons |
|---|---|---|
| **On-premises closet** | Cheapest long-term, full control | Need physical access for maintenance |
| **Colocation (e.g. MacStadium)** | Remote management, redundant power/network | $79-149/mo per Mac mini |
| **Mac mini in a datacenter rack** | 1U shelf kits available | Requires relationship with colo provider |

For early-stage: start with 1-2 Mac minis in a closet or under a desk. Migrate to colocation when you need reliability guarantees.

---

## Scaling Architecture

### Level 1: Vertical — Squeeze More From One Persona

Before adding hardware:

| Optimization | Impact | Status |
|---|---|---|
| Raise rate limit to 120/min | 2x capacity | Done |
| SendQueue with retry | Prevents silent message drops | Done |
| Batched AppleScript sends | 5x faster multi-bubble | Done |
| Parallel message processing | 2-3x throughput | Done |
| Native Swift bridge | 10x faster sends (150ms -> 15ms) | Planned |
| Per-thread rate limits | Active convos don't block each other | Planned |

### Level 2: Horizontal — Persona Sharding

When one Sage instance can't handle all users, run **multiple Sage instances** with different phone numbers behind backend-level routing:

```
                    +----------------------------------+
                    |         Cloud Backend            |
                    |                                  |
                    |  User Assignment Router:         |
                    |  +----------------------------+  |
                    |  | New user signs up for Sage |  |
                    |  |          |                 |  |
                    |  | SELECT shard with lowest   |  |
                    |  | active_user_count          |  |
                    |  |          |                 |  |
                    |  | Assign: user -> shard      |  |
                    |  | (sticky assignment)        |  |
                    |  +----------------------------+  |
                    +------+----------+----------+-----+
                           |          |          |
                    +------+---+ +----+-----+ +--+-------+
                    | Sage-01  | | Sage-02  | | Sage-03  |
                    | Mac mini | | Mac mini | | Mac mini |
                    | +1(xxx)  | | +1(yyy)  | | +1(zzz)  |
                    | 0001     | | 0002     | | 0003     |
                    |          | |          | |          |
                    | <=200    | | <=200    | | <=200    |
                    | users    | | users    | | users    |
                    +----------+ +----------+ +----------+
```

**Key design decisions:**

1. **Sticky assignment** — once a user is assigned to Sage shard `+1xxx0001`, they stay there. No mid-conversation migration.
2. **Same persona, different numbers** — all shards share the same Sage personality, prompts, and memory backend. The user doesn't know which shard they're on.
3. **Backend owns routing** — edge agents are dumb relays. The backend decides shard assignment based on load.
4. **No edge code changes** — each edge agent already identifies itself by phone number and agent_id. The backend routes to the right one.

### Level 3: Fleet Management

At 10+ Mac minis, you need fleet tooling:

| Concern | Solution |
|---|---|
| **Deployment** | Ansible playbooks or MDM (Jamf, Mosyle) for macOS config |
| **Monitoring** | Each edge agent exposes `/health` endpoint; aggregate with Prometheus/Grafana |
| **Auto-recovery** | `launchd` plist with `KeepAlive=true` restarts crashed agents |
| **Updates** | Git pull + restart via SSH, or automated with CI/CD webhook |
| **Alerting** | Sentry for errors, Amplitude for usage metrics, PagerDuty for downtime |

---

## Scaling Formula

```
users_per_shard   = 150   (moderate usage, conservative)
personas_per_mac  = 4     (balanced profile)

shards_needed     = ceil(total_users / users_per_shard)
mac_minis_needed  = ceil(shards_needed / personas_per_mac)
```

### Examples

| Scenario | Users | Shards | Mac minis | Monthly cost (colo) |
|---|---|---|---|---|
| **Seed stage** | 500 Sage users | 4 | 1 | $99 |
| **Growth** | 2,000 Sage users | 14 | 4 | $396 |
| **Scale** | 10,000 Sage + other personas | 70+ | 18 | $1,782 |
| **Large** | 50,000 across all personas | 350+ | 88 | $8,712 |

These numbers assume moderate usage (3-5 msgs/day per user). Heavy usage (10+ msgs/day) roughly halves the users per shard.

---

## Migration Checklist: Adding a New Shard

1. **Provision Mac mini** — set up macOS user, sign into iMessage with new Apple ID + phone number
2. **Deploy edge agent** — clone repo, configure `config.yaml` with new phone number and agent_id
3. **Register with backend** — the edge agent auto-registers on `POST /edge/register`
4. **Add shard to backend routing** — insert row in `persona_shards` table
5. **Verify** — send test message, confirm round-trip works
6. **Enable routing** — backend starts assigning new users to this shard

---

## Monitoring Queue Health

The SendQueue exposes stats via the admin dashboard:

```json
{
  "send_queue": {
    "depth": 3,
    "totalEnqueued": 1542,
    "totalDelivered": 1539,
    "totalDropped": 0
  }
}
```

| Metric | Healthy | Warning | Critical |
|---|---|---|---|
| `depth` | 0-10 | 10-50 | 50+ (sustained) |
| `totalDropped` | 0 | 1-5 | 5+ (queue overflow) |
| Drop rate | 0% | <1% | >1% |

If `depth` stays elevated, the persona is overloaded — consider adding a shard.

---

*Last Updated: 2026-02-18*
