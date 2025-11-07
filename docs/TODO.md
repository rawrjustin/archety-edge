# Edge Relay - TODOs and Future Work

## Backend Work Required

### WebSocket Endpoint (High Priority)
**Status:** Edge client ready, backend not implemented

The edge client has full WebSocket support implemented and is attempting to connect to `/edge/ws` endpoint, but the backend returns 403 Forbidden.

**Impact:**
- Currently falling back to HTTP polling (15s interval)
- WebSocket would provide ~150× faster command delivery (<100ms vs 15s)
- Real-time command execution for immediate responses

**Implementation Needed (Backend):**
1. Implement `/edge/ws` WebSocket endpoint
2. Add authentication via HMAC (edge client sends Authorization header)
3. Implement command push protocol:
   ```json
   {
     "type": "command",
     "command": {
       "command_id": "...",
       "command_type": "...",
       "payload": {...}
     }
   }
   ```
4. Handle acknowledgments from edge client
5. Implement ping/pong keepalive (30s interval)

**Reference:** See `docs/BACKEND_WEBSOCKET_SPEC.md` for full protocol specification.

## Edge Client Enhancements

### Nice-to-Have Features

1. **Rate Limiting**
   - Prevent abuse of message sending
   - Configurable limits per thread/global
   - Priority: Medium

2. **Metrics Endpoint**
   - HTTP endpoint for monitoring
   - Expose: uptime, message counts, rule stats, error rates
   - Priority: Low

3. **Rule Engine Actions**
   - Currently only stores rules, doesn't execute actions
   - Need to integrate rule evaluation into message processing pipeline
   - Auto-reply, forward, filter actions
   - Priority: Medium

4. **Advanced Plan Features**
   - Plan templates
   - Plan history/versioning UI
   - Plan expiration/cleanup
   - Priority: Low

5. **Performance Monitoring**
   - Add internal metrics collection
   - Performance benchmarks in CI
   - Alerting for degraded performance
   - Priority: Low

6. **Group Chat Improvements**
   - Cache group participants (avoid repeated DB queries)
   - Detect participant changes
   - Handle group chat renames
   - Priority: Low

## Documentation

### Needed Documentation

1. **API Reference**
   - Internal interfaces documentation
   - Rule engine API examples
   - Plan manager API examples
   - Priority: Low

2. **Deployment Guide**
   - Production deployment checklist
   - Security hardening guide
   - Backup/recovery procedures
   - Priority: Medium

3. **Contribution Guidelines**
   - Code style guide
   - PR process
   - Testing requirements
   - Priority: Low

4. **Changelog**
   - Version history
   - Breaking changes
   - Migration guides
   - Priority: Low

## Testing

### Test Coverage Improvements

1. **Integration Tests** ✅ DONE
   - Rule engine integration: ✅
   - Plan manager integration: ✅
   - Command handler integration: ✅
   - WebSocket integration: TODO
   - Message flow E2E: TODO

2. **Unit Test Coverage**
   - Current: 73.74%
   - Target: 85%+
   - Priority: Low

3. **Performance Tests**
   - Benchmark suite for critical paths
   - Regression detection
   - Priority: Low

## Security

### Security Enhancements ✅ COMPLETED

1. ✅ Remove hardcoded secret fallbacks
2. ✅ Require environment variables
3. ✅ Comprehensive .env.example
4. **Input validation** (Additional work needed)
   - Enhance AppleScript injection protection
   - Add message length limits
   - Validate all command payloads
   - Priority: Medium

5. **Audit Logging**
   - Log all security-relevant events
   - Separate audit log file
   - Priority: Low

## Known Issues

### Minor Issues

1. **LaunchDaemon User Context**
   - Currently runs as root (via LaunchDaemon)
   - Consider LaunchAgent for user-level
   - May affect Messages.app access
   - Priority: Low

2. **Database Locking**
   - SQLite databases may lock under high concurrency
   - Consider connection pooling or WAL mode
   - Priority: Low

3. **Error Recovery**
   - Some error scenarios may not recover gracefully
   - Need more comprehensive error handling tests
   - Priority: Low

## Completed ✅

- ✅ WebSocket client implementation
- ✅ LaunchDaemon auto-start
- ✅ Rule engine (storage and evaluation)
- ✅ Plan manager (storage and updates)
- ✅ Group chat participants query
- ✅ Security hardening (removed fallback secrets)
- ✅ Portable installation scripts
- ✅ Integration test suite (rule engine, plan manager, command handler)
- ✅ Comprehensive documentation structure

---

**Last Updated:** 2025-01-06
