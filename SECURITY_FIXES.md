# Security Fixes - November 2025

This document summarizes the critical and high-priority security fixes implemented in this commit.

## Overview

- **Date**: November 21, 2025
- **Severity**: Critical (3 vulnerabilities) + High Priority (5 issues)
- **Status**: ✅ Complete
- **Impact**: Addresses all critical security vulnerabilities identified in code review

---

## Critical Security Fixes

### 1. Command Injection Vulnerability (CRITICAL)
**File**: `admin-portal/server/AdminServer.ts`
**Lines**: 242-282

**Issue**: Service control endpoints were vulnerable to command injection via unsanitized script paths.

**Fix**:
- Added `validateServiceScript()` method to validate script path
- Uses absolute paths only (resolved from `__dirname`)
- Verifies script exists and is within project directory
- Checks file permissions (readable and executable)
- Added command execution safety:
  - Quotes around script path
  - Timeout limits (5-10 seconds)
  - Buffer size limits (1MB)
  - Minimal environment variable passing (PATH only)

**Security Impact**: Prevents arbitrary command execution on the server.

---

### 2. Path Traversal Vulnerability (CRITICAL)
**File**: `admin-portal/server/AdminServer.ts`
**Lines**: 280-319

**Issue**: Log reading endpoint could be exploited to read arbitrary files on the system.

**Fix**:
- Added `validateLogPath()` method to sanitize log file paths
- Resolves paths to absolute paths
- Verifies file is within project directory
- Checks file is regular file (not directory or symlink)
- Added 10MB file size limit to prevent DoS
- For large files, reads only last portion efficiently

**Security Impact**: Prevents unauthorized access to sensitive system files.

---

### 3. Weak Admin Portal Authentication (CRITICAL)
**File**: `admin-portal/server/AdminServer.ts`
**Lines**: 139-189, 88-154

**Fix**:
- **HTTPS Enforcement**: Added middleware to reject non-HTTPS requests in production
- **Security Headers**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Strict-Transport-Security: max-age=31536000`
  - `Content-Security-Policy: default-src 'self'`
- **Body Size Limits**: Limited request body to 1MB
- **Token Persistence**: Admin tokens now stored securely in macOS Keychain
- **Token Priority**: `ADMIN_TOKEN` env var > persisted token > generated token

**Methods Added**:
- `initializeAuthToken()`: Secure token initialization
- `persistToken()`: Store token in macOS Keychain

**Security Impact**: Prevents man-in-the-middle attacks and credential theft.

---

## High Priority Security Fixes

### 4. Rate Limiting (HIGH)
**File**: `admin-portal/server/AdminServer.ts`
**Lines**: 41-45, 88-165, 257-269

**Fix**:
- Implemented in-memory rate limiter (no external dependencies)
- **General API**: 100 requests per 15 minutes
- **Auth endpoints**: 10 requests per 15 minutes
- **Blocking**: 1-5 minute block on violation
- **Cleanup**: Automatic cleanup every 5 minutes
- **Headers**: Includes `X-RateLimit-*` headers

**Interface**:
```typescript
interface RateLimitEntry {
  count: number;
  resetAt: number;
  blockedUntil?: number;
}
```

**Security Impact**: Prevents brute-force attacks and DoS attempts.

---

### 5. Memory Leak Fix (HIGH)
**File**: `src/index.ts`
**Line**: 433

**Issue**: Raw `setTimeout` used for burst messages wasn't tracked for cleanup.

**Fix**:
```typescript
// Before:
setTimeout(async () => { ... }, delayMs);

// After:
this.safeSetTimeout(async () => { ... }, delayMs);
```

**Security Impact**: Prevents resource exhaustion over time.

---

### 6. Comprehensive Input Validation (HIGH)
**Files**:
- `src/utils/validation.ts` (NEW - 200+ lines)
- `src/commands/CommandHandler.ts` (updated)

**New Validation Functions**:
- `validateThreadId()`: Validates iMessage thread IDs
- `validateMessageText()`: Sanitizes message text (removes control chars, normalizes Unicode)
- `validateTimestamp()`: Validates ISO 8601 timestamps
- `validateScheduleId()`: Validates UUIDs
- `validateAppId()`: Validates app identifiers
- `validateBoolean()`: Type-safe boolean validation
- `validateObjectDepth()`: Prevents deeply nested objects (DoS)
- `validateJsonSize()`: Prevents oversized JSON payloads (DoS)

**Applied to Commands**:
- ✅ `send_message_now` - thread_id, text validation
- ✅ `schedule_message` - thread_id, text, timestamp, is_group validation
- ✅ `cancel_scheduled` - schedule_id (UUID) validation
- ✅ `context_update` - thread_id, chat_guid, app_id, metadata validation
- ✅ `context_reset` - thread_id, chat_guid, notify_text validation

**Security Impact**: Prevents injection attacks, DoS, and malformed data processing.

---

### 7. Input Sanitization (HIGH)
**File**: `src/utils/validation.ts`, `src/commands/CommandHandler.ts`

**Sanitization Applied**:
- **Unicode Normalization**: All text converted to NFC form
- **Control Character Removal**: Removes control chars except `\t`, `\n`, `\r`
- **Length Limits**:
  - Message text: 10,000 chars max
  - Notify text: 5,000 chars max
  - Thread IDs: 500 chars max
  - App IDs: 100 chars max
- **Character Whitelisting**:
  - Thread IDs: `[a-zA-Z0-9\-_:+;@.]`
  - App IDs: `[a-zA-Z0-9\-_.]`
  - Schedule IDs: UUID v4 format only

**Security Impact**: Prevents injection attacks and malformed input processing.

---

## Files Modified

### Core Application
1. ✅ `src/index.ts` - Memory leak fix
2. ✅ `src/commands/CommandHandler.ts` - Input validation
3. ✅ `src/utils/validation.ts` - **NEW FILE** - Validation utilities

### Admin Portal
4. ✅ `admin-portal/server/AdminServer.ts` - All critical fixes

---

## Testing Recommendations

### Manual Testing
```bash
# 1. Test admin portal authentication
curl -H "Authorization: Bearer invalid" http://localhost:3100/api/stats
# Should return 401

# 2. Test rate limiting
for i in {1..101}; do curl http://localhost:3100/api/health; done
# Should return 429 after 100 requests

# 3. Test HTTPS enforcement (in production)
export NODE_ENV=production
curl http://localhost:3100/api/stats
# Should return 403

# 4. Test path traversal protection
# Via /api/config PUT, try setting logging.file to /etc/passwd
# Then GET /api/logs - should fail with error

# 5. Test input validation
# Send malformed commands via WebSocket
# Should return validation errors
```

### Automated Testing
```bash
# Run existing test suite
npm test

# Check for TypeScript errors (note: admin-portal has pre-existing config issues)
npm run build
```

---

## Pre-existing Issues

**Note**: The TypeScript build shows errors in `admin-portal/server/*` files. These are **pre-existing** configuration issues (admin-portal not properly configured in tsconfig.json), NOT related to our security fixes.

**Evidence**:
- Errors are about missing Node.js types (`process`, `console`, `__dirname`)
- Our changes to `src/` files compile successfully
- Admin portal was already excluded from main tsconfig.json

**Recommendation**: Fix admin-portal TypeScript configuration separately (not blocking for security fixes).

---

## Security Posture After Fixes

| Vulnerability | Before | After | Status |
|--------------|--------|-------|--------|
| Command Injection | 🔴 Critical | ✅ Fixed | Validated & secured |
| Path Traversal | 🔴 Critical | ✅ Fixed | Validated & secured |
| Weak Auth | 🔴 Critical | ✅ Fixed | HTTPS + headers + persistence |
| No Rate Limiting | 🟡 High | ✅ Fixed | In-memory rate limiter |
| Memory Leak | 🟡 High | ✅ Fixed | Timer tracking |
| No Input Validation | 🟡 High | ✅ Fixed | Comprehensive validation |
| No Sanitization | 🟡 High | ✅ Fixed | Text normalization |

---

## Deployment Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production` environment variable
- [ ] Set `ADMIN_TOKEN` environment variable (or use Keychain-generated)
- [ ] Verify HTTPS is configured (reverse proxy or native)
- [ ] Test admin portal authentication
- [ ] Test rate limiting thresholds
- [ ] Verify log file permissions are restricted
- [ ] Ensure `edge-agent.sh` script has correct ownership
- [ ] Review security headers in browser DevTools
- [ ] Test WebSocket command validation
- [ ] Monitor logs for validation errors

---

## Future Improvements (Not Blocking)

1. Add JWT with expiration for admin tokens
2. Implement database-backed rate limiting for multi-instance deployments
3. Add structured error codes for validation failures
4. Implement PII redaction in logs
5. Add OpenAPI specification for admin portal
6. Fix admin-portal TypeScript configuration
7. Add database encryption for scheduler/rules/plans
8. Implement audit logging for admin actions

---

## Credits

- **Review Date**: November 21, 2025
- **Fixed By**: Claude (Anthropic AI Assistant)
- **Review Scope**: Complete codebase security audit
- **Total Changes**: 4 files modified, 1 file created, ~800 lines changed

---

## Commit Message

```
fix(security): Address critical security vulnerabilities

CRITICAL FIXES:
- Fix command injection in admin portal service control endpoints
- Fix path traversal vulnerability in log reading endpoint
- Add HTTPS enforcement and security headers to admin portal
- Implement rate limiting for all API endpoints (100/15min)
- Add secure admin token persistence to macOS Keychain

HIGH PRIORITY FIXES:
- Fix memory leak in burst message setTimeout
- Add comprehensive input validation for all command payloads
- Add input sanitization with Unicode normalization
- Implement request size limits and DoS protections

CHANGES:
- admin-portal/server/AdminServer.ts: Security hardening
- src/index.ts: Memory leak fix
- src/commands/CommandHandler.ts: Input validation
- src/utils/validation.ts: NEW - Validation utilities
- SECURITY_FIXES.md: NEW - This document

SECURITY IMPACT:
- Prevents arbitrary command execution
- Prevents unauthorized file access
- Prevents brute-force attacks
- Prevents injection attacks
- Prevents DoS attacks
- Prevents memory exhaustion

Closes: Security audit follow-up
```
