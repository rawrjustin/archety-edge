/**
 * Input validation utilities for security hardening
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: any;
}

/**
 * Validate and sanitize thread ID
 * Thread IDs should match iMessage format: chat\d+ or valid identifier
 */
export function validateThreadId(threadId: any): ValidationResult {
  if (typeof threadId !== 'string') {
    return { valid: false, error: 'thread_id must be a string' };
  }

  if (threadId.length === 0) {
    return { valid: false, error: 'thread_id cannot be empty' };
  }

  if (threadId.length > 500) {
    return { valid: false, error: 'thread_id too long (max 500 chars)' };
  }

  // Must contain only alphanumeric, dash, underscore, colon, plus, semicolon
  // This matches iMessage thread ID format
  if (!/^[a-zA-Z0-9\-_:+;@.]+$/.test(threadId)) {
    return { valid: false, error: 'thread_id contains invalid characters' };
  }

  return { valid: true, sanitized: threadId.trim() };
}

/**
 * Validate and sanitize message text
 * Removes control characters and limits length
 */
export function validateMessageText(text: any, maxLength: number = 10000): ValidationResult {
  if (typeof text !== 'string') {
    return { valid: false, error: 'text must be a string' };
  }

  if (text.length === 0) {
    return { valid: false, error: 'text cannot be empty' };
  }

  if (text.length > maxLength) {
    return { valid: false, error: `text too long (max ${maxLength} chars)` };
  }

  // Sanitize: normalize Unicode and remove control characters (except newlines/tabs)
  const sanitized = text
    .normalize('NFC')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, ''); // Remove control chars except \t, \n, \r

  if (sanitized.length === 0) {
    return { valid: false, error: 'text contains only invalid characters' };
  }

  return { valid: true, sanitized };
}

/**
 * Validate timestamp string (ISO 8601)
 */
export function validateTimestamp(timestamp: any): ValidationResult {
  if (typeof timestamp !== 'string') {
    return { valid: false, error: 'timestamp must be a string' };
  }

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'invalid timestamp format (expected ISO 8601)' };
  }

  // Reject timestamps too far in the future (more than 1 year)
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  if (date > oneYearFromNow) {
    return { valid: false, error: 'timestamp is too far in the future' };
  }

  // Warn if timestamp is in the past (but allow it for scheduling)
  const now = new Date();
  if (date < now) {
    // Still valid, just note that it's in the past
  }

  return { valid: true, sanitized: date.toISOString() };
}

/**
 * Validate rule ID
 */
export function validateRuleId(ruleId: any): ValidationResult {
  if (typeof ruleId !== 'string') {
    return { valid: false, error: 'rule_id must be a string' };
  }

  if (ruleId.length === 0) {
    return { valid: false, error: 'rule_id cannot be empty' };
  }

  if (ruleId.length > 255) {
    return { valid: false, error: 'rule_id too long (max 255 chars)' };
  }

  // Allow alphanumeric, dash, underscore only
  if (!/^[a-zA-Z0-9\-_]+$/.test(ruleId)) {
    return { valid: false, error: 'rule_id contains invalid characters' };
  }

  return { valid: true, sanitized: ruleId };
}

/**
 * Validate schedule ID (UUID format)
 */
export function validateScheduleId(scheduleId: any): ValidationResult {
  if (typeof scheduleId !== 'string') {
    return { valid: false, error: 'schedule_id must be a string' };
  }

  // UUID v4 format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(scheduleId)) {
    return { valid: false, error: 'schedule_id must be a valid UUID' };
  }

  return { valid: true, sanitized: scheduleId };
}

/**
 * Validate app ID
 */
export function validateAppId(appId: any): ValidationResult {
  if (typeof appId !== 'string') {
    return { valid: false, error: 'app_id must be a string' };
  }

  if (appId.length === 0) {
    return { valid: false, error: 'app_id cannot be empty' };
  }

  if (appId.length > 100) {
    return { valid: false, error: 'app_id too long (max 100 chars)' };
  }

  // Allow alphanumeric, dash, underscore, dot
  if (!/^[a-zA-Z0-9\-_.]+$/.test(appId)) {
    return { valid: false, error: 'app_id contains invalid characters' };
  }

  return { valid: true, sanitized: appId };
}

/**
 * Validate boolean value
 */
export function validateBoolean(value: any, fieldName: string): ValidationResult {
  if (typeof value !== 'boolean') {
    return { valid: false, error: `${fieldName} must be a boolean` };
  }

  return { valid: true, sanitized: value };
}

/**
 * Validate object is not too deeply nested (prevent DoS)
 */
export function validateObjectDepth(obj: any, maxDepth: number = 10): ValidationResult {
  function getDepth(o: any, depth: number = 0): number {
    if (depth > maxDepth) return depth;
    if (typeof o !== 'object' || o === null) return depth;

    let maxChildDepth = depth;
    for (const key in o) {
      if (o.hasOwnProperty(key)) {
        const childDepth = getDepth(o[key], depth + 1);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }
    }
    return maxChildDepth;
  }

  const depth = getDepth(obj);
  if (depth > maxDepth) {
    return { valid: false, error: `object nesting too deep (max ${maxDepth} levels)` };
  }

  return { valid: true, sanitized: obj };
}

/**
 * Validate JSON string size (prevent DoS)
 */
export function validateJsonSize(json: any, maxBytes: number = 1024 * 1024): ValidationResult {
  const jsonString = JSON.stringify(json);
  const byteSize = Buffer.byteLength(jsonString, 'utf8');

  if (byteSize > maxBytes) {
    return { valid: false, error: `JSON too large (max ${maxBytes} bytes, got ${byteSize})` };
  }

  return { valid: true, sanitized: json };
}
