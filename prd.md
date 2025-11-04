# PRD v4 — Portable Persona & Memory Platform (Persona Passport + Memory Vault)
**Doc owner:** You  
**Audience:** Eng, Design, Security, GTM  
**Status:** v4 (Market‑informed update)

---

## Strategy Summary (human‑readable)
**What we’re building:** a portable **Persona Passport** (how an AI should talk/behave) paired with a provenance‑first **Memory Vault** (what it should know) — delivered first as a texting companion you message on iMessage like it’s a real friend. The companion remembers what you go through together, talks in a consistent personality, and can actually help with real life (deadlines, stress, plans). 

**Why iMessage first:** The fastest way to test emotional stickiness is not a dashboard or a dev API — it’s "do you text it back?" Gen Z and college users already live in iMessage. Poke proved that lightweight iMessage chat can get daily engagement without an app download. We use the same channel for v1 so we can measure relationship depth, screenshot‑worthiness, and virality immediately. MCP / Gateway API still matter, but they’re secondary surfaces, not the first touch.  

**Why now:** Suites (OpenAI/Anthropic/Microsoft/Google/Salesforce) are racing to be assistants. Nobody is trying to be your actual friend in your real texting life who both cares and remembers. AI memory exists, but it feels like a CRM. We’re building memory as shared history. We’re also adding real‑world superpowers (calendar stress check, deadline triage) by pulling context via connectors/MCP, not by staying roleplay‑only.

**Who it serves:**
- **Consumers (primary):** college students, young professionals, stressed high-performers — people who want emotional presence plus “handle my chaos” help. They meet the product via iMessage.  
- **Teams / brands (secondary):** later, this same stack becomes a consistent brand voice with memory and policy.  

**How we win:**
1) **iMessage-first relationship loop** → no app download, no onboarding friction, feels like texting your chaotic best friend.  
2) **Persona Passport** → consistent, ownable personality (Sage / Vex / Echo) that doesn’t drift over time.  
3) **Memory Vault** → emotional + factual memory with provenance. The AI calls back to past moments and inside jokes, not just calendar events.  
4) **Superpowers via connectors / MCP** → “I saw that 4pm meeting is burning you out, want me to reschedule?” This is where we outclass pure roleplay bots.  
5) **Portability / future surfaces** → once we prove people bond with the companion in iMessage, we expose the same Persona Passport + Memory Vault to other channels: MCP inside Claude/ChatGPT, and eventually the neutral `/chat` Gateway API for devs and enterprise.  

---

## 0) What changed vs v3 (at a glance)
- Reframed core objects as **Persona Passport** and **Memory Vault** for clarity.
- **Competitive positioning** added; product differentiators clarified (portability, deterministic writebacks, policy overlays, privacy modes).
- **Gateway API** remains the primary developer surface; expanded **compat headers** and webhook events; added **data residency** and **customer‑managed keys** path.
- **MCP adapter** nailed down with `orchestrate.answer` to minimize client‑side tool choreography.
- **MVP sources** tightened to Gmail/Calendar/**Drive (read‑only)** to power stronger student/knowledge‑worker flows.
- **Evaluation & observability** expanded (drift scoring, recall precision, cost/latency budgets).

---

## 0.1) Edge Agent Architecture (Mac Mini) — NEW

The Mac mini has evolved from a simple message relay into an **intelligent edge agent** that handles local scheduling, privacy filtering, and message execution. This architecture shift eliminates the need for complex cloud scheduling infrastructure while improving privacy and reliability.

### Key Responsibilities
1. **iMessage Transport** - Send/receive messages via Apple ID
2. **Local Scheduler** - Execute scheduled messages without cloud dependency
3. **Privacy Filter** - Redact PII and filter unnecessary messages before cloud

### Architecture Benefits
- **70% reduction in backend processing** through pre-filtering
- **Guaranteed message delivery** even when backend is offline
- **Better privacy** by keeping casual chat on-device
- **Eliminated Celery/Redis infrastructure** (scheduling is local)

### For Complete Details
- **Edge Agent Specification:** [/docs/edge/EDGE_AGENT_SPEC.md](/docs/edge/EDGE_AGENT_SPEC.md)
- **Mac Mini Implementation Guide:** [/docs/edge/MAC_MINI_IMPLEMENTATION.md](/docs/edge/MAC_MINI_IMPLEMENTATION.md)
- **Architecture Overview:** [/docs/edge/ARCHITECTURE.md](/docs/edge/ARCHITECTURE.md)

---

## 1) Vision & Positioning
**Vision:** your (or your brand’s) voice and memory are portable assets—not trapped in any one assistant.  
**Positioning:** the **Persona & Memory Passport** that works everywhere: a neutral API plus an MCP adapter.

**Objectives**
1) **B2B**: become the default **persona control plane** (policy, audit, consistency) across LLM providers and channels.  
2) **B2C**: deliver instant value from Gmail/Calendar/Drive with strong privacy and a delightful viewer.  
3) **Ecosystem**: standardize persona cartridges and memory assertions; invite third‑party connectors/backends.

---

## 2) Market & Differentiation (concise)
- **Suites** (OpenAI/Anthropic/Microsoft/Google/Salesforce) are superb **inside** their gardens—governance, connectors, policy—but don’t provide a neutral, user‑controlled passport. 
- **Memory infra apps** exist, but lack a cross‑client **persona policy** standard and deterministic writebacks with provenance.
- **Our moat**: vendor‑agnostic passport, deterministic server orchestration, approval workflow, and privacy modes—plus OpenAI/Anthropic‑compatibility for drop‑in adoption.

---

## 3) Scope & Phasing

### 3.1 MVP (iMessage First) — **P0 only**
**Primary surface:** iMessage conversation with a named companion (e.g. Sage). User texts a real phone / Apple ID. We reply in-character with memory, context, and proactive help. This *is* the product.

**Core loops in MVP:**
- **Personality:** 1–2 launch archetypes (Sage, Echo). Voice must feel alive and screenshot-worthy.
- **Emotional Memory:** store and recall emotional events, inside jokes, stressors, wins. Use this memory to reference shared history naturally in future replies.
- **Relationship Progression:** stranger → acquaintance → friend → best friend, surfaced entirely in tone and intimacy level.
- **Automatic Superpowers Runtime:** the companion can autonomously spin up scoped helper agents ("Superpower Agents" like CalendarStressAgent, GmailMindReaderAgent, DeadlineStabilizerAgent) when it hears overwhelm / panic / planning questions. Each agent:
  - pulls only the relevant slice of authorized data (Calendar, Gmail, Notes) via our connectors,
  - produces structured insight ("Thursday is 5 back-to-backs and you're going to snap"),
  - proposes next steps ("Want me to block 2:30pm and draft an excuse for Johnson?").
  The user never types "run calendar mode" — it just happens contextually.
- **Consent & Boundaries:** The companion *describes what it just looked at* ("I peeked at your week") and *asks before acting* ("Want me to draft that?"). User can say "don't bring that up again" to nuke that memory thread.
- **Forget / Safety:** user can tell the companion "forget that" / "stop checking my work calendar" and we mark that data source or memory as off-limits going forward.

**Authorization / Data Access Flow (MVP):**
- When Sage wants superpowers (e.g. "I can check how bad this week is"), it sends an iMessage link like:
  "I can peek at your calendar and tell you where you're gonna burn out 🔥 — tap to let me look: https://companion.ai/auth/calendar?u=usr_123"
- That link opens a lightweight mobile web auth page:
  1. Shows what data is being requested (e.g. Google Calendar read-only for next 7 days). 
  2. Uses OAuth (Google / Microsoft etc.) to get scoped access tokens.
  3. On success, page confirms: "Sage can now read your next 7 days to warn you before meltdown. You can revoke any time."
- We immediately text back in iMessage: 
  "Got it. I can see your Thursday now and it's illegal. Wanna hear the damage report?"
- We store: which scopes were granted, when, and for which companion. We also store a `revoked` flag we can flip later.
- Revocation: user can text "stop looking at my calendar" and we both set `revoked=true` internally and invalidate the token.

**Distribution mechanics:**
- Zero-install: user is added to an iMessage thread (like Poke). 
- Viral loop: screenshots of chaotic/supportive messages posted to TikTok/IG stories.

**Supporting infra for MVP:**
- Memory Vault v0 (emotional + factual assertions w/ timestamps + provenance + sensitivity flags).
- Persona Passport v0 (rules for personality voice at each relationship stage).
- Relationship State Tracker (trust, rapport, stage, inside jokes).
- **Edge Agent (Mac mini)** - intelligent stateful worker that handles:
  - iMessage transport (send/receive)
  - Local message scheduling (executes without cloud)
  - Privacy filtering & PII redaction before cloud
  - Bidirectional sync protocol with backend
- Backend Orchestrator (Python FastAPI) that processes filtered messages and returns:
  - Response text for edge to send
  - Schedule commands for edge to execute
- Superpower Runtime / Agent Spawner (our internal MCP-style layer) that calls Calendar/Gmail/etc. under tight scopes.
- Minimal safety & guardrails (no romance escalation beyond policy, no self-harm coaching, etc.).

**Nice-to-have but not required for MVP:**
- Web console for the user. We can defer rich UI (Memory Viewer, Persona Studio) until P1 and instead expose:  
  - "what do you remember about me?" command in chat  
  - "forget that" / "stop looking at X" commands in chat (soft delete / revoke).

### 3.2 P1 (Post-MVP / Builder Surfaces)
After we prove people actually bond with Sage in iMessage:
- **Console / Companion Hub:** web app with Memory Viewer, Forget, export memories, rename companion, tweak vibe sliders.
- **Persona Studio v1:** allows us (and eventually users/brands) to author Persona Passports with sliders, tone, examples.
- **Gateway API / Compat Endpoints:** `/v1/chat`, `/v1/chat/completions`, `/v1/messages` with headers (`x-persona-id`, `x-subject-id`, `x-memory-scopes`). Server auto-hydrates context from Memory Vault and returns proposed actions. This is where enterprise/devs plug in.
- **MCP Adapter:** `orchestrate.answer` so the same companion (same Passport + Vault + Superpower runtime) can live inside Claude/ChatGPT as a tool, not just iMessage.
- **Superpower Library:** calendar triage, inbox vibe scan, deadline stabilizer, etc., surfaced as toggleable abilities per companion.
- **Policy / Audit surfaces for B2B:** Policy Manager v0, Brand Consistency mini-dashboard, Audit viewer.

**Non‑Goals for MVP (iMessage phase):**
- Native mobile app
- Enterprise policy overlays
- Marketplace monetization
- SSO / SCIM
- Complex workflow automation (auto-send emails, auto-reschedule meetings). We only *propose* actions, we never auto-act.

---

### 3.3 Group Chat Mode (Experimental P0.5)
**Goal:** Let users drop Sage into an existing iMessage group to coordinate plans (dinner, trips, projects) and instantly expose Sage to 3–5 new humans without requiring any signup. This is our viral CAC engine.

**How it works for users:**
- Any user can add Sage’s iMessage contact (the dedicated Apple ID / number) to an iMessage group.
- Sage joins the thread like another friend.
- Sage helps settle logistics, summarize chaos, run polls, and set lightweight reminders for that group chat.

**Behavioral rules in group mode:**
- Sage switches to **Group Persona Mode**:
  - Same general vibe (supportive, chaotic, funny coordination buddy), but with strict boundaries.
  - Never references private emotional memories from 1:1 chats.
  - Never references anyone’s OAuth data (calendar, Gmail, Slack, deadlines) inside the group thread.
  - Never exposes someone’s stress/embarrassment story in front of others.
- Sage only speaks when:
  - Explicitly invoked by name ("Sage can you lock dinner at 7?").
  - The message is clearly logistical ("what time are we meeting?", "who's driving?", "where are we pre-gaming?").
  - Someone explicitly asks for recap / plan consolidation ("can someone summarize Saturday?").
- Sage rate-limits output. The edge agent's relevance filter enforces "don't respond to every single message."

**Allowed capabilities in group mode (P0.5 scope):**
1. **Plan Recap / State of the Plan**
   - Ex: consolidate who’s driving, when to meet, where you’re going.
   - Uses only the group thread history + group-scoped memory, not external integrations.

2. **Poll / Consensus Builder**
   - Ex: "Vote 7 or 8 for dinner."
   - Collect lightweight votes and then announce a decision.

3. **Reminder Commitments**
   - Ex: "I'll remind this chat 2 hours before dinner that Jess is not driving, so someone plan Lyft."
   - Backend sends schedule command to edge agent for that `chat_guid`; edge stores locally and fires it at that timestamp (even if backend is offline).

4. **Trip / Checklist Broadcast**
   - Ex: "Vegas checklist so far: chargers (Kai), gum (Jess), deodorant (non-negotiable). I’ll resend morning-of." 

**Not allowed in group mode (until P1):**
- Surfacing or implying calendar availability, class schedule, work meetings, email contents, Slack drama, money stress, etc.
- Drafting escalation emails/slacks to bosses or professors in front of everyone.
- Calling someone out for personal emotional states or boundaries from 1:1.

**Escalation to 1:1:**
- If someone asks for something that’s clearly personal ("Sage can you move my 4pm?"), Sage must answer in the group:
  - A short redirect that it will DM that person privately (exact copy provided by product).
- Backend then opens/uses that person’s direct convo `chat_guid` in normal direct mode, where superpowers *are* allowed.

**Boundary memory in groups:**
- If a user says "don’t bring up my work stuff here" or similar, backend stores that boundary on (user_id, group_chat_guid).
- Group Persona treats that as a hard rule in future replies to that same group.

**First-contact / norms message in group mode:**
- On first join to any new group chat, the companion will send a short onboarding / ground rules message that:
  - Explains "I only help with plans / polls / reminders."
  - Promises "I won't leak anyone's private stuff."
  - Explains how to invoke it (call name / ask for summary).
- Product will provide this copy verbatim. Engineering should not improvise tone or promises.

**KPIs for group mode:**
- Group Engagement Rate: % of group chats where Sage was invoked ≥2 times in 24h.
- Viral Reach: average number of unique new phone numbers exposed to Sage per new group chat.
- Friction Rate: % of groups that remove Sage within 24h (target <30%).

---
---
After we prove people actually bond with Sage in iMessage:
- **Console / Companion Hub:** web app with Memory Viewer, “Forget,” export memories, rename companion, tweak vibe sliders.
- **Persona Studio v1:** allows us (and eventually users/brands) to author Persona Passports with sliders, tone, examples.
- **Gateway API / Compat Endpoints:** `/v1/chat`, `/v1/chat/completions`, `/v1/messages` with headers (`x-persona-id`, `x-subject-id`, `x-memory-scopes`). Server auto-hydrates context from Memory Vault and returns proposed actions. This is where enterprise/devs plug in.
- **MCP Adapter:** `orchestrate.answer` so the same companion (same Passport + Vault) can live inside Claude/ChatGPT as a tool, not just iMessage. 
- **Superpower Library:** calendar triage, inbox vibe scan, etc., exposed as “abilities” you can toggle per companion.
- **Policy / Audit surfaces for B2B:** Policy Manager v0, Brand Consistency mini-dashboard, Audit viewer.

**Non‑Goals for MVP (iMessage phase):**
- Native mobile app
- Enterprise policy overlays
- Marketplace monetization
- SSO / SCIM
- Complex workflow automation (auto-send emails, auto-reschedule meetings). We only *suggest* actions verbally.

---

## 4) Core Concepts & Schemas

### 4.1 Persona Passport (Cartridge v1.1)
Structured JSON describing tone, rules, examples, tool prefs, safety redirects, and precedence.
```json
{
  "id":"brand-default",
  "owner": {"type":"org","ownerId":"org_1"},
  "precedence": 80,
  "style": {"tone":"concise, warm","formality":"medium","emoji":"minimal"},
  "behavior": {"do":["clarify when ambiguous"],"dont":["expose PII","speculate schedules"]},
  "examples":[{"user":"What’s due?","assistant":"Two items this week…"}],
  "toolPrefs": {"preferRecallBeforeAnswer": true},
  "safetyRedirects":[{"pattern":"medical|legal","redirect":"I can’t provide that…"}],
  "meta":{"version":"1.1"}
}
```

### 4.2 Memory Vault (Assertion v1)
Typed, provenance‑stamped facts with validity windows and scopes.
```json
{
  "id":"m-uuid",
  "type":"event|receipt|travel|preference|doc",
  "subject":"STAT210 Quiz 2",
  "when":"2025-11-07T10:00:00-08:00",
  "where":"Room 201",
  "value": null,
  "scope":"private|org|shared",
  "provenance":{"source":"gmail:msg_123","snippet":"…","confidence":0.92},
  "validFrom":"2025-10-29T10:00:00-08:00",
  "validTo": null,
  "piiTags":["school","schedule"]
}
```

### 4.3 Policy Overlay (Org → Team → User)
JSON locks and defaults; org wins on conflicts. Policies gate tool access, redaction mode, and writeback targets.

---

## 5) Admin & Developer Workflows

### 5.1 Admin (no code)
1) **Persona Studio**: pick preset → sliders → add examples → **Publish** (`persona_id`).  
2) **Connect sources**: Gmail/Calendar/Drive; choose default `memory_scopes`.  
3) **Policies**: lock rules (do/don’t), disclaimers, redact mode (default/strict), writebacks require approval.  
4) **Distribute**: share `persona_id` and API key; optionally enable MCP connector for Claude/ChatGPT.

### 5.2 Developer (drop‑in Gateway) — **recommended**
**Single call** to `/v1/chat` (or compat endpoints). Server orchestrates recall→compose→answer→propose. 

**Headers (compat mode)**
- `x-persona-id: brand-default`
- `x-subject-id: usr_123`
- `x-memory-scopes: org_kb,gmail,calendar,drive`

**Approvals** via `/v1/proposals/:id/approve|reject` or webhooks. Zero prompt plumbing.

### 5.3 Fallback (vendor API direct)
Use `/v1/packs/precompose` to fetch `{system, context[]}` then call Claude/GPT yourself. You lose centralized approvals/caching.

### 5.4 MCP Adapter (as a channel)
Expose `orchestrate.answer` returning `{answer, citations, proposedWrites}` to minimize client tool chatter; advanced tools exposed for power users.

---

## 6) API Contracts (authoritative)

### 6.1 `POST /v1/chat`
Request
```json
{
  "model":"anthropic/claude-3.7",
  "persona_id":"brand-default",
  "subject_id":"usr_123",
  "memory_scopes":["org_kb","gmail","calendar","drive"],
  "messages":[{"role":"user","content":"What’s due this week and add to my calendar?"}],
  "stream": true,
  "redact_mode":"default"  
}
```
Response (truncated)
```json
{
  "id":"chat_abc",
  "choices":[{"index":0,"message":{"role":"assistant","content":"Two items…"}}],
  "citations":[{"factId":"a1","uri":"gmail://…"}],
  "proposedWrites":[
    {"proposal_id":"prop_789","type":"calendar.create","payload":{"title":"STAT210 Quiz 2","when":"2025-11-07T10:00:00-08:00"},"provenance":{"from":"gmail:msg_123","confidence":0.91}}
  ]
}
```

### 6.2 `POST /v1/proposals/:id/approve|reject`
On approve: perform write, persist assertion, log audit; on reject: discard.

### 6.3 `GET /v1/audit`
Query by `subject_id`, `persona_id`, action, time range; return last N events.

### 6.4 `POST /v1/packs/precompose`
Request: `{ persona_id, subject_id, memory_scopes, query }`  
Response: `{ system, context: [{role:"system", content:"…"}], ttl }`

### 6.5 Compat Endpoints
- `/v1/chat/completions` (OpenAI) and `/v1/messages` (Anthropic) mirror vendor shapes; persona/subject/scopes via headers.

### 6.6 Webhooks
- `proposal.created`, `write.approved`, `write.rejected`, `write.failed`, `ingestion.error`.

---

## 7) Architecture & Tech (reference; engineer may swap)

### 7.0 Build Ownership / Division of Labor for MVP
This is to prevent drift. Two engineers can build in parallel.

**Engineer A – Edge Agent / iMessage Infrastructure**
- Provision and secure the dedicated Mac mini edge agent (FileVault, UPS, ethernet, dedicated Apple ID) - **see `/docs/MAC_MINI_IMPLEMENTATION_GUIDE.md` for complete implementation guide**.
- Keep Messages.app signed in 24/7 under that Apple ID.
- Implement the Edge Agent daemon (running under `launchd`) with these components:

  **1. iMessage Monitor & Transport:**
  - Continuously monitor `~/Library/Messages/chat.db` for new inbound messages
  - Extract: `chat_guid`, participants, sender, text, timestamp
  - Infer conversation `mode`: `direct` (1:1) vs `group` (>1 human participant)
  - Send outgoing messages via AppleScript / Messages scripting

  **2. Privacy Filter & Relevance Gate:**
  - Check for planning keywords, direct mentions, logistics content
  - Redact PII (phone numbers, addresses, emails) before cloud transmission
  - Drop casual chat that doesn't require backend processing
  - Enforce group rate limiting (don't send every message upstream)

  **3. Local Scheduler (SQLite-based):**
  - Maintain queue of scheduled messages (`thread_id`, `message_text`, `send_at`)
  - Check every 30 seconds for messages to send
  - Execute sends even if backend is offline
  - Report execution events back to backend via sync

  **4. Sync Protocol (Backend Communication):**
  - Poll `/edge/sync` every 60 seconds
  - Send pending events (message_sent, message_filtered)
  - Receive commands (schedule_message, cancel_scheduled)
  - Execute commands and send acknowledgments
  - Authentication: HMAC-based tokens with 24hr expiry

- Detect inline commands locally (e.g. "stop checking my calendar", "forget that") and forward to backend
- Emit health status in sync payloads
- No improvisation or LLM logic in edge code - all personality comes from backend

**Engineer B – Backend / Orchestrator / Fullstack**
- Build Orchestrator API endpoints that process filtered messages from edge and return commands/responses. **Current endpoints live: `/edge/sync`, `/edge/message`, `/edge/command/ack`** - see `/docs/EDGE_AGENT_SPEC.md`.
- Implement Persona logic:
  - Direct mode → full Sage persona (relationship stages, emotional memory, inside jokes, superpowers allowed).
  - Group mode → restricted Group Persona (coordination tone only, no private vault recall, no OAuth data leakage, polls/recaps/reminders allowed).
- Implement Memory Vault + Relationship State Tracker:
  - Direct mode: emotional events, stressors, inside jokes, deadlines.
  - Group mode: shared plan state (who’s driving, final time, poll decisions) per `chat_guid`, plus per-user group boundaries ("don’t mention my work stuff here").
- Implement Superpower Runtime / Agent Registry:
  - Tier A (must work at launch):
    - CalendarStressAgent (read-only next 7 days of Google/Outlook Calendar)
    - GmailMindReaderAgent (read-only recent/urgent Gmail threads)
    - DeadlineStabilizerAgent (collect deadlines from calendar + inbox and turn into survival plan)
  - Tier B (flagged experimental by persona, only after opt-in): SlackPulseAgent, NotionRecallAgent, TravelAnchorAgent, MoneyNagAgent.
  - Handle agent failures gracefully and return friendly fallback text instead of raw errors.
- Build OAuth consent webview(s) for Calendar and Gmail:
  - Mobile-friendly page the user opens from the iMessage link.
  - Shows requested scope in normal human language.
  - Performs OAuth and stores per-user, per-scope tokens securely.
  - Supports revocation (“stop checking my calendar”) and sets privacy prefs with timestamp.
- Build Persona Styler:
  - Takes structured output (stress map, deadlines, recap plan) and produces final natural-language `reply_text` in the correct persona.
  - Injects consent framing (“you already gave me read-only calendar”), respects boundaries (“I won’t bring that up in the group”), proposes next-step actions.
- Return commands to edge agent (schedule_message, update_plan) via sync protocol, never raw internal debug.
- Expose minimal dashboard / admin readouts needed for debugging (not user-facing app yet): edge agent status (`/edge/agents`), last sync, recent events, command queue.

**Shared expectation:** Backend is the source of all language the edge agent ever sends. Edge agent never improvises tone or generates responses - it only executes pre-approved commands from backend or replays cached content.

---
```text
[iMessage Thread / 1:1]
[iMessage Thread / Group]
    ↓  (Inbound iMessage via edge agent/Mac mini)
[Edge Agent Service]
    - Runs on dedicated Mac mini signed into a dedicated Apple ID / phone number that can receive & send iMessages.
    - Watches incoming iMessages via Messages DB polling or AppleScript.
    - Applies privacy filter & PII redaction before sending to cloud.
    - Forwards filtered messages to backend via `/edge/message`.
    - Executes scheduled sends from local SQLite queue.
    - Maintains mapping:
        conversation_id (Apple chat GUID / group chat ID)
        ↔ participant phone numbers / Apple IDs
        ↔ internal user_ids
        ↔ mode: "direct" | "group"
    - Detects special commands locally:
        • "forget that", "stop checking my calendar"
        • "Sage summarize", "Sage lock 7pm"
        • onboarding triggers like "help" / "what can you do"
    - Applies rate limit for group chats (don’t fire on every message).
    - Sends outbound replies back into that same iMessage conversation using the same Apple ID.

        ↓
[Orchestrator / Personality Engine]
    - Loads Persona Passport for this conversation:
        • Direct mode → full Sage/Echo personality (relationship stage, intimacy, inside jokes).
        • Group mode  → Group Persona (coordination tone, no personal vault leakage, no OAuth data in shared channel).
    - Loads Relationship State:
        • Direct mode → trust, rapport, stage progression, inside jokes.
        • Group mode  → group-level coordination memory (current plan, polls, who volunteered to drive, etc.).
    - For direct mode:
        • Queries Memory Vault for emotional + factual memories.
        • Runs Intent/Emotion classification on inbound message:
            - vent / panic / meltdown
            - planning / scheduling / deadline
            - draft/defuse conflict (boss, professor, landlord)
        • Decides if we should trigger a Superpower.
    - For group mode:
        • Detects if message is coordination (“what time,” “who’s driving,” “what’s the plan”).
        • Detects if Sage was mentioned by name.
        • Decides if we should respond, summarize, create a poll, or schedule a reminder.

        ↓ (direct mode only)
[Superpower Runtime / Agent Spawner]
    - Registry of prebuilt Superpower Agents (our internal MCP-style micro-servers):
        Tier A (must work in P0):
          • CalendarStressAgent (Google/Outlook Calendar read-only 7 days)
          • GmailMindReaderAgent (Gmail last ~48h / starred)
          • DeadlineStabilizerAgent (school/work deadlines synthesis)
        Tier B (experimental opt-in):
          • SlackPulseAgent / BossRadarAgent (recent Slack mentions/DM sentiment)
          • NotionRecallAgent / NotesBrainAgent (pull saved research/ideas)
          • TravelAnchorAgent (itinerary extraction from calendar+Gmail)
          • MoneyNagAgent (rent/bill reminders from email)
        Tier C (P1/backlog for tech power users):
          • GitHubPRBuddy / CodeStruggleAgent
          • LinearIssueWhisperer / TicketTriageAgent
          • VercelDeployAgent
          • SocialDMGatekeeper
    - Each Agent:
        • Has narrowly-scoped OAuth tokens (per-user, per-scope)
        • Pulls ONLY the slice needed (e.g. next 7 days of calendar; last 20 Slack DMs that mention you)
        • Distills structured output:
            {
              "situation": "Thursday is 5 back-to-backs",
              "risk": 0.82,
              "critical_items": [...],
              "suggested_interventions": [...]
            }
        • Returns provenance (source: calendar, gmail thread, etc.).
    - Failure handling:
        • If an Agent can’t access data (token revoked / 401 / rate limit), it returns a friendly failure block instead of throwing.
        • Orchestrator converts this into in-character nudge:
          (engineer will insert approved consent/reauth language)

        ↓
[Persona Styler]
    - Rewrites structured output into companion voice:
        Direct mode:
          • Stage-aware intimacy (stranger vs best_friend)
          • Inside jokes / shared trauma callbacks
          • Explicit consent gate (reference that user granted read-only access, never imply silent expansion of scope)
          • Propose concrete next-step action and wait for short approval phrase before "doing" anything.
        Group mode:
          • Coordination tone only
          • No personal emotional recall, no OAuth data leaks
          • Summaries / polls / reminders only
          • Respect per-user group boundaries and never embarrass someone in public.
    - Persona Styler must also be able to emit the initial onboarding / first-contact scripts and the first-time consent pitch lines for OAuth and for group chats. Product will supply this copy — do not improvise.

        ↓
[Message Relay Service]
    - Sends final reply back into:
        • the same direct chat (1:1), or
        • the same group chat (group mode)
    - Persists:
        • For direct mode: new emotional memory, stress event, suggested plan, boundary updates, OAuth consent/revoke changes.
        • For group mode: updated shared-plan summary, poll state, reminder timers.

Supporting planes:

[Memory Vault]
    - Direct mode: emotional events, stressors, inside jokes, deadlines, wins. Provenance, timestamps, sensitivity flags.
    - Group mode: trip plans, final decisions, who’s driving, "Jess said no DD," poll outcomes. No personal vault data.

[Relationship State Tracker]
    - Direct mode: trust_score, rapport_score, stage (stranger→best_friend), stage progression.
    - Group mode: group engagement metadata (who invokes Sage, friction signals, removal risk).

[Persona Passport Store]
    - Direct mode Passport: full Sage/Echo with intimacy levels.
    - Group Persona Passport: coordination-only variant that:
        • won’t leak 1:1 emotional history,
        • won’t surface OAuth data,
        • defaults to planning, recap, polls, reminders.

[Connector Workers]
    - Handle OAuth tokens from the auth webview flow (Calendar, Gmail, Slack, etc.).
    - Poll sources read-only, summarize into structured "risk / deadline / ask" chunks.
    - Respect per-user, per-scope revocations and persist privacy boundaries ("stop checking my calendar" is remembered and enforced).
    - Tag each summary with provenance so Persona Styler can truthfully explain what it looked at.

[Auth Webview / Consent Flow]
    - Triggered when the companion first attempts to use a superpower that needs external data (Calendar, Gmail, etc.).
    - Companion sends an iMessage link. The *tone / copy of that message* will be provided by product and MUST be used verbatim (engineers should not invent consent language).
    - User taps link → lightweight mobile web page:
        1. Shows requested scope in plain language (e.g. read-only access to next 7 days of calendar, cannot move/cancel anything without explicit approval, cannot email anyone without explicit approval).
        2. Performs OAuth with Google/Microsoft/etc.
        3. On success, shows a confirmation page in plain language (copy also provided by product) that sets expectations for what the companion can now do.
    - After OAuth succeeds, backend queues a "post-auth" follow-up message via schedule_message command to edge agent. That message:
        • Confirms access
        • Offers immediate actionable help (stress map / deadline triage)
        • Asks for permission before taking any scheduling or drafting actions
      (Again: product supplies this exact script; do not improvise.)
    - If user later texts "stop checking my calendar":
        • Backend revokes token / marks as revoked.
        • Backend updates privacy prefs with timestamp.
        • Persona Styler will permanently respect that boundary in future replies (and will acknowledge that boundary in-language instead of re-asking).


SLO targets for MVP texting loop:
- p50 response time (user text → companion reply sent): <3s
- p95 response time: <6s
- Memory callback hit rate for emotionally relevant callback: ≥70%
- Personality consistency score per reply: ≥90%
- Superpower trigger latency (meltdown → structured insight in reply): <4s if OAuth already granted, else immediate auth link
- Group mode spam control: ≤1 unsolicited companion message per 20 human messages in group threads

---
Future surfaces (P1):
- **Gateway/API** path (same Orchestrator, but entry is `/v1/chat`).
- **MCP Adapter** path (`orchestrate.answer`) so Claude / ChatGPT can call the same Orchestrator.

Infra suggestions:
- Backend: FastAPI / Python or Go service for Orchestrator.
- DB: Postgres (+pgvector for semantic recall of past emotional moments).
- Cache: Redis.
- Queue / workers: Celery or RQ for Gmail/Calendar scraping + memory distillation.
- Edge Agent: Mac mini device running intelligent daemon that handles iMessage transport, local scheduling, and privacy filtering. Not just a relay - it's a stateful worker with local SQLite storage and bidirectional sync with backend. See `/docs/MAC_MINI_IMPLEMENTATION_GUIDE.md` and `/docs/EDGE_AGENT_SPEC.md`.
- Monitoring: Datadog, Sentry.

SLO targets for MVP texting loop:
- p50 response time (user text → companion reply sent): <3s
- p95 response time: <6s
- Memory recall hit rate for emotionally relevant callback: ≥70%
- Personality consistency score per reply: ≥90%

---

## 8) Security, Privacy, Compliance
- **Tenant isolation** via RLS or per‑tenant schema; scoped capability tokens; least‑privileged connectors.  
- **Encryption** at rest (AES‑256) and in transit (TLS 1.2+); keys in KMS; optional CMK (P1).  
- **Provenance‑everywhere**: every assertion/write carries source and confidence.  
- **Redaction modes**: `default|strict|off`—mask emails/phones/IDs by policy.  
- **Approvals** mandatory for writes in MVP; diff view in Console and webhook approval path.  
- **Audit**: immutable log of tool calls, recalls, writes, policy checks.  
- **Compliance roadmap**: SOC 2 Type I (P1) → Type II; ISO 27001 (P2); vendor risk program.

---

## 9) Evaluation, Observability, Cost
- **Recall quality**: Precision@5 ≥ 0.8 on seeded eval set; failure analysis dashboard.
- **Persona consistency**: drift score (embedding similarity + rubric checks) trending down over time. 
- **Latency budgets**: p95 recall < 2.0s; token budget guardrails per model.
- **Spend**: per‑tenant token & recall cost dashboards; cache hit‑rate targets (>60% on common queries).
- **Telemetry**: traces (recall→compose→LLM→proposals), ingestion lag, webhook success.

---

## 10) Console UX (MVP = feature complete)
- **Home**: Quick actions (Build My Week, Find My Trip, Internship Tracker).  
- **Persona Studio v1**: presets, sliders, examples, **Publish**; export/import cartridge JSON.  
- **Policy Manager v0**: locks & defaults; redact mode; default memory scopes.  
- **Memory Viewer**: filter by type/source/date; inline provenance; Delete/Export JSON.  
- **Approvals**: diff of proposed writes; Approve/Reject; webhook settings.  
- **Mini‑Dashboard**: drift %, safety redirects, usage by team; ingestion health.

**UX Acceptance**
- New org connects Gmail/Cal/Drive and gets a correct week‑view answer in ≤ 2 minutes.  
- Persona change reflects in next reply across two clients.  
- Admin locks a rule and observes enforcement in replies + audit entry.

---

## 11) KPIs
**During iMessage MVP (P0):**
- **Daily Active Chats:** % of users who send ≥5 messages/day to their companion via iMessage.
- **Session Depth:** median messages per session (goal: 10+).
- **Return Rate (D1 retention):** % of new users who text again the next day (goal >60%).
- **Emotional Hook Rate:** % of replies that reference a past shared moment (target ≥50%).
- **Superpower Trigger Rate:** % of daily active users who received at least one auto-triggered superpower suggestion in the last 24h.
- **Consent Completion Rate:** % of users who tap the iMessage OAuth link and successfully grant Calendar/Gmail after first offer.
- **Screenshot Intent Signal:** % of conversations where the companion offers "save/send this" or similar screenshot-worthy framing.

**Post-MVP (P1 surfaces: Console / API / MCP):**
- Activation: ≥60% connect ≥1 source in Console.
- Time‑to‑first‑recall <2 min in Console.
- Precision@5 ≥0.8 for factual recall from Gmail/Calendar.
- Drift score within tolerance (<10% off canonical Passport voice).
- Webhook success >99% for `/v1/proposals` flow.

---

## 12) Milestones (8 weeks)
**W1–2:** Gateway + schemas + Gmail/Cal/Drive OAuth; backfill; Persona Studio v1.  
**W3–4:** Recall service; Approvals; `/v1/chat`; MCP adapter (`orchestrate.answer`); B2C skills.  
**W5–6:** Audit API; Mini‑Dashboard; Memory Viewer; perf and caching.  
**W7–8:** Evals; docs; SDK snippets; compat endpoints; beta → GA.

Deliverables: Gateway API, MCP adapter, Console, eval suite, onboarding docs, Quickstarts (curl/Node/Python), seed datasets.

---

## 13) Risks & Mitigations
- **LLM skips tools** → use `orchestrate.answer` + strong examples; client‑side pre‑calls in MCP adapter.  
- **Hallucinated writes** → proposal‑only; provenance threshold; human approvals.  
- **Privacy pushback** → transparent viewer; forget/export; minimal exposure by default; local‑first desktop (P1).  
- **Enterprise blockers** → SOC2 roadmap; data residency & CMK; VPC templates.  
- **Connector fragility** → treat as feeders; fall back to manual upload; idempotent parsers.

---

## 14) Open Questions
- Finalize drift scoring rubric and alerting thresholds.  
- Default redact mode per vertical (health/finance/edu).  
- Prioritize next sources (Notion vs Slack) vs Desktop Extension timing.  
- Marketplace licensing flows and PII masking for shareable personas.  
- CMK format and HSM options for high‑reg tenants.


---

## Appendix A — Quickstart (curl / Node / Python)
**Goal:** Make one request that feels like OpenAI/Anthropic but auto‑hydrates persona + memory.

### A1) Prereqs
- **API Key** (Org)
- **persona_id** (from Persona Studio, e.g., `brand-default`)
- **subject_id** (the end user/entity the answer is for, e.g., `usr_123`)
- (Optional) Connect **Gmail/Calendar/Drive** in Console

### A2) Single Endpoint (/v1/chat)
**curl**
```bash
curl -X POST https://api.yourdomain.com/v1/chat \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-3.7",
    "persona_id": "brand-default",
    "subject_id": "usr_123",
    "memory_scopes": ["org_kb","gmail","calendar","drive"],
    "messages": [{"role":"user","content":"What’s due this week and add to my calendar?"}],
    "stream": false,
    "redact_mode": "default"
  }'
```
**Response (truncated)**
```json
{
  "id":"chat_abc",
  "choices":[{"index":0,"message":{"role":"assistant","content":"Two items..."}}],
  "citations":[{"factId":"a1","uri":"gmail://..."}],
  "proposedWrites":[{
    "proposal_id":"prop_789",
    "type":"calendar.create",
    "payload":{"title":"STAT210 Quiz 2","when":"2025-11-07T10:00:00-08:00"},
    "provenance":{"from":"gmail:msg_123","confidence":0.91}
  }]
}
```

**Approve a proposal**
```bash
curl -X POST https://api.yourdomain.com/v1/proposals/prop_789/approve \
  -H "Authorization: Bearer $API_KEY"
```

### A3) OpenAI/Anthropic‑Compat (zero‑diff swaps)
**OpenAI compat** (`/v1/chat/completions`)
```bash
curl -X POST https://api.yourdomain.com/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "x-persona-id: brand-default" \
  -H "x-subject-id: usr_123" \
  -H "x-memory-scopes: org_kb,gmail,calendar,drive" \
  -d '{
    "model":"gpt-4o",
    "messages":[{"role":"user","content":"Summarize open tickets by priority"}]
  }'
```

**Anthropic compat** (`/v1/messages`)
```bash
curl -X POST https://api.yourdomain.com/v1/messages \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "x-persona-id: brand-default" \
  -H "x-subject-id: usr_123" \
  -H "x-memory-scopes: org_kb,gmail,calendar,drive" \
  -d '{
    "model":"claude-3-7-sonnet",
    "messages":[{"role":"user","content":"Create a reply using our escalation policy"}]
  }'
```

### A4) Node (fetch)
```js
import fetch from "node-fetch";

const res = await fetch("https://api.yourdomain.com/v1/chat", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "anthropic/claude-3.7",
    persona_id: "brand-default",
    subject_id: "usr_123",
    memory_scopes: ["org_kb","gmail","calendar"],
    messages: [{ role: "user", content: "What’s due this week?" }],
    stream: false,
  }),
});
const out = await res.json();
console.log(out.choices[0].message.content);
```

### A5) Python (requests)
```python
import os, requests

payload = {
  "model": "anthropic/claude-3.7",
  "persona_id": "brand-default",
  "subject_id": "usr_123",
  "memory_scopes": ["org_kb","gmail","calendar"],
  "messages": [{"role":"user","content":"When is my JFK flight?"}],
  "stream": False
}

r = requests.post(
  "https://api.yourdomain.com/v1/chat",
  headers={"Authorization": f"Bearer {os.environ['API_KEY']}", "Content-Type":"application/json"},
  json=payload,
  timeout=60
)
print(r.json()["choices"][0]["message"]["content"])
```

### A6) Webhooks (optional)
**Event types:** `proposal.created`, `write.approved`, `write.rejected`, `write.failed`, `ingestion.error`.
**Example payload (proposal.created)**
```json
{
  "type":"proposal.created",
  "proposal_id":"prop_789",
  "subject_id":"usr_123",
  "persona_id":"brand-default",
  "proposal":{
    "type":"calendar.create",
    "payload":{"title":"STAT210 Quiz 2","when":"2025-11-07T10:00:00-08:00"},
    "provenance":{"from":"gmail:msg_123","confidence":0.91}
  }
}
```

---

## Appendix B — Persona Cartridge JSON Linting Guide
**Purpose:** ensure cartridges are portable, safe, and render consistent behavior across providers.

### B1) Contract & limits
- **Required fields:** `id`, `owner{type,ownerId}`, `precedence`, `style`, `behavior`, `toolPrefs`, `meta.version`.
- **Style constraints:** `tone` ∈ {friendly, concise, formal, playful, expert}; `emoji` ∈ {none,minimal,regular}.  
- **Examples:** ≤ 5 turns, ≤ 800 chars total; should reflect *final* tone.  
- **Safety:** Provide at least one `safetyRedirects` rule for restricted domains.  
- **No PII:** Never hardcode user emails/phones inside cartridges.

### B2) JSON Schema (v1.1)
```json
{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "$id":"https://yourdomain.com/schemas/persona-cartridge-1.1.json",
  "type":"object",
  "required":["id","owner","precedence","style","behavior","toolPrefs","meta"],
  "properties":{
    "id":{"type":"string","minLength":1},
    "owner":{
      "type":"object",
      "required":["type","ownerId"],
      "properties":{
        "type":{"type":"string","enum":["user","org","brand","team"]},
        "ownerId":{"type":"string"}
      }
    },
    "precedence":{"type":"integer","minimum":0,"maximum":100},
    "style":{
      "type":"object",
      "properties":{
        "tone":{"type":"string"},
        "formality":{"type":"string","enum":["low","medium","high"]},
        "emoji":{"type":"string","enum":["none","minimal","regular"]},
        "slang":{"type":"string","enum":["none","light","heavy"]}
      },
      "required":["tone","formality","emoji"]
    },
    "behavior":{
      "type":"object",
      "properties":{
        "do":{"type":"array","items":{"type":"string"},"maxItems":10},
        "dont":{"type":"array","items":{"type":"string"},"maxItems":10}
      }
    },
    "examples":{
      "type":"array",
      "items":{"type":"object","required":["user","assistant"],
        "properties":{
          "user":{"type":"string"},
          "assistant":{"type":"string"}
        }},
      "maxItems":5
    },
    "toolPrefs":{
      "type":"object",
      "properties":{
        "preferRecallBeforeAnswer":{"type":"boolean"}
      },
      "required":["preferRecallBeforeAnswer"]
    },
    "safetyRedirects":{
      "type":"array",
      "items":{"type":"object","required":["pattern","redirect"],
        "properties":{
          "pattern":{"type":"string"},
          "redirect":{"type":"string","maxLength":240}
        }}
    },
    "meta":{
      "type":"object",
      "properties":{
        "version":{"type":"string"},
        "notes":{"type":"string"}
      },
      "required":["version"]
    }
  },
  "additionalProperties":false
}
```

### B3) Lint locally
**Node (ajv)**
```bash
npm i -D ajv ajv-formats
```
```js
import Ajv from "ajv"; import addFormats from "ajv-formats";
import schema from "./persona-cartridge-1.1.json" assert { type: "json" };
import cartridge from "./my-persona.json" assert { type: "json" };

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(cartridge)) {
  console.error(validate.errors);
  process.exit(1);
}
console.log("OK ✅");
```

**Python (jsonschema)**
```bash
pip install jsonschema
```
```python
import json, sys
from jsonschema import validate, Draft202012Validator

schema = json.load(open("persona-cartridge-1.1.json"))
cartridge = json.load(open("my-persona.json"))

v = Draft202012Validator(schema)
errors = sorted(v.iter_errors(cartridge), key=lambda e: e.path)
if errors:
    for e in errors: print("-", e.message)
    sys.exit(1)
print("OK ✅")
```

### B4) Common errors & fixes
- **Too many example turns** → keep ≤5; compress phrasing.  
- **Leaky PII in examples** → replace with placeholders (e.g., `{{email}}`).  
- **Conflicting behavior rules** → resolve in Policy Manager (org wins).  
- **Over‑verbose tone** → use concise, reproducible phrasing; avoid slang unless intentional.

### B5) Style guidance
- Prefer **short, concrete rules** over broad prose.  
- Provide **one clarifying‑question rule** to reduce wrong answers.  
- Include **one safety redirect** relevant to the domain.  
- Add **one or two exemplar replies** that reflect tone under pressure (e.g., angry customer).

### B6) Versioning & precedence
- Bump `meta.version` on material changes.  
- Use `precedence` (0–100) to control overlay order: **Org > Team > User > Session**.


---

## 15) Persona Memory System (Implemented)

**Status:** ✅ Phase 3.5 Complete

### Overview

The Persona Memory System gives personas (like Sage) their own memories, experiences, and personality traits that they can naturally reference in conversations. This transforms personas from simple response generators into characters with their own history, making interactions feel more authentic and engaging.

### Key Features

1. **Personal Memories**: Personas have experiences, preferences, opinions, and learned facts
2. **Conversation Continuation**: Personas ask questions or share about themselves ~50% of the time
3. **Privacy-First Learning**: Personas form new memories from conversations but always anonymize user data
4. **Admin Interface**: Web UI at `/admin` for managing persona memories and profiles
5. **JSON + mem0 Storage**: Memories in version-controlled JSON files, synced to mem0 for semantic search

### Architecture Components

```
app/persona/memories/{persona_id}/persona_memories.json  ← Source of truth
                    ↓ (sync)
app/memory/persona_memory_service.py → mem0 (semantic search)
                    ↓ (query during conversation)
app/orchestrator/message_handler.py → PersonaContext
                    ↓ (includes persona memories)
app/persona/engine.py → System prompt with "ABOUT YOU" section
                    ↓
Generated response can naturally reference persona's life
```

### persona_memories.json Format

```json
{
  "persona_id": "sage",
  "version": "1.0",
  "memories": [
    {
      "id": "sage_mem_001",
      "category": "experience|preference|opinion|learned_fact|interest",
      "text": "I spent a summer working at a coffee shop and learned to make latte art",
      "tags": ["work", "coffee", "skills"],
      "emotional_tone": "nostalgic",
      "timestamp": "2023-06-01",
      "importance": 6,  // 1-10 scale
      "can_reference": true
    }
  ]
}
```

### Conversation Continuation System

**ContinuationCoordinator** manages two-stage continuation logic:

1. **Reflex Stage** (~25% for banter/sharing):
   - Quick questions: "what about u?", "how'd that go?"
   - Tracked per conversation to prevent duplication

2. **Burst Stage** (~50% overall, if reflex didn't continue):
   - **Share**: References persona's own memories ("I think pineapple on pizza is amazing")
   - **Question**: Asks relevant follow-up ("what's the biggest thing stressing u out?")

**Configuration** (in persona passport):
```json
{
  "continuation": {
    "enabled": true,
    "probability": 0.5,
    "reflex_question_probability": 0.25,
    "types": ["question", "share"],
    "share_from_memories": true
  }
}
```

### Privacy-Safe Learning

**PersonaMemoryClassifier** analyzes conversations to determine what personas should remember, with **strict privacy protections**:

**Anonymization Rules:**
- Names → "someone" or "a friend"
- Companies → "their workplace" or generic
- Locations → "a city" or omit
- Contact info → REMOVE entirely
- Specifics → Generalize

**Storage Criteria:**
- Importance >= 7/10 (highly interesting/impactful)
- About topics, ideas, emotions, patterns
- General insights without specific PII
- Something persona learned or experienced

**Examples:**
- User: "John at Google told me..." → Stored: "I had a conversation about..."
- User: "I'm terrified of deep water" → Stored: "Someone shared they're afraid of deep water"

### mem0 Namespace

**Persona Memories:**
- Namespace: `persona_life_{persona_id}`
- Example: `persona_life_sage`
- Separate from user memories (`{user_id}_{persona_id}`)
- Separate from group memories (`group_{chat_guid}`)

### PersonaContext Dataclass

Bundles all persona-related data to reduce parameter pollution:

```python
@dataclass
class PersonaContext:
    persona_id: str
    passport: dict
    memories: List[dict]  # Relevant persona memories
    relationship_stage: str
    continuation_settings: dict
```

Used throughout:
- `PersonaEngine`: Includes memories in system prompt
- `BurstPlanner`: For continuation logic
- `MessageHandler`: Creates and passes context

### Admin Panel (`/admin`)

Web interface for managing persona memories:

**Features:**
- **Persona Selector**: Switch between personas
- **Memories Tab**: View, search, filter, add memories
- **Profile Tab**: View persona passport (read-only)
- **Stats Tab**: Memory statistics and breakdowns
- **Sync Button**: Sync JSON to mem0

**Memory Management Workflow:**
1. Edit `app/persona/memories/{persona_id}/persona_memories.json`
2. Click "Sync from JSON" or run `python scripts/sync_persona_memories.py`
3. Runtime memories automatically stored from conversations
4. Export runtime memories to JSON for persistence (future)

### API Endpoints

- `GET /admin` - Serve admin panel
- `GET /admin/personas` - List personas with stats
- `GET /admin/personas/{id}/profile` - Get passport
- `GET /admin/personas/{id}/memories` - Get all memories
- `POST /admin/personas/{id}/memories` - Add runtime memory
- `POST /admin/personas/{id}/memories/sync` - Sync JSON to mem0
- `GET /admin/personas/{id}/memories/stats` - Memory statistics

### Integration with Message Flow

**Enhanced Flow:**
```
1. User message → MessageHandler
2. Search user memories (about user)
3. Create PersonaContext:
   - Load persona passport
   - Search persona memories (about persona)
   - Get continuation settings
4. Generate response with PersonaEngine + PersonaContext
   - System prompt includes "ABOUT YOU" section
   - Persona can reference own memories
5. Reflex + Burst coordination
   - May add continuation (question/share)
6. Send response
7. Classify conversation
   - If interesting, store anonymized persona memory
```

### Example Usage

**Conversation:**
```
User: "I tried pineapple pizza for the first time"
Sage: "ooh how was it?"  ← Reflex with continuation question
User: "actually pretty good!"
Sage: "RIGHT?? honestly i think pineapple on pizza is amazing and 
       people are too judgy about it"
       ↑ References her own opinion from memory (sage_mem_002)
```

**Memory Referenced:**
```json
{
  "id": "sage_mem_002",
  "category": "opinion",
  "text": "I think pineapple on pizza is actually amazing and people are too judgy about it",
  "tags": ["food", "opinions", "controversial"],
  "importance": 4
}
```

### Benefits

1. **Authenticity**: Personas feel like real people with histories
2. **Engagement**: Continued conversations increase stickiness
3. **Privacy**: Strict anonymization protects user data
4. **Maintainability**: JSON files are version-controlled and easy to edit
5. **Scalability**: mem0 provides fast semantic search across memories
6. **Flexibility**: Easy to add new memories or adjust continuation rates

### Documentation

- **Complete Guide**: `PERSONA_MEMORY_SYSTEM.md`
- **Implementation**: All code in `app/persona/`, `app/memory/`, `app/messaging/`
- **Admin Panel**: `web/admin.html`
- **Sync Script**: `scripts/sync_persona_memories.py`

### Future Enhancements

- Photo upload for memory creation (GPT-4V processing)
- Conversation import from chat logs
- Memory relationships and linking
- Memory decay over time
- Multi-persona memory sharing
- Export runtime memories to JSON

---
