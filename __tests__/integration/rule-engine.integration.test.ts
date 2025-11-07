/**
 * Integration tests for RuleEngine
 */
import { RuleEngine, Rule } from '../../src/rules/RuleEngine';
import { MockLogger } from '../mocks/MockLogger';
import * as fs from 'fs';
import * as path from 'path';

describe('RuleEngine Integration', () => {
  let ruleEngine: RuleEngine;
  let logger: MockLogger;
  const testDbPath = path.join(__dirname, 'test-rules.db');

  beforeEach(() => {
    // Clean up test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    logger = new MockLogger();
    ruleEngine = new RuleEngine(testDbPath, logger);
  });

  afterEach(() => {
    ruleEngine.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('should create and retrieve a rule', () => {
    const rule: Rule = {
      rule_id: 'test-rule-1',
      rule_type: 'auto_reply',
      name: 'Test Auto Reply',
      enabled: true,
      conditions: [
        { field: 'content', operator: 'contains', value: 'hello' }
      ],
      action: {
        type: 'reply',
        parameters: { message: 'Hi there!' }
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    ruleEngine.setRule(rule);
    const retrieved = ruleEngine.getRule('test-rule-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.rule_id).toBe('test-rule-1');
    expect(retrieved?.name).toBe('Test Auto Reply');
  });

  test('should evaluate message against rules', () => {
    const rule: Rule = {
      rule_id: 'test-rule-2',
      rule_type: 'auto_reply',
      name: 'Keyword Match',
      enabled: true,
      conditions: [
        { field: 'content', operator: 'contains', value: 'urgent' }
      ],
      action: {
        type: 'reply',
        parameters: { message: 'I will respond ASAP' }
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    ruleEngine.setRule(rule);

    const message = {
      sender: '+15551234567',
      content: 'This is urgent please respond',
      thread_id: 'test-thread',
      is_group: false
    };

    const matchedRule = ruleEngine.evaluateMessage(message);
    expect(matchedRule).not.toBeNull();
    expect(matchedRule?.rule_id).toBe('test-rule-2');
  });

  test('should not match when conditions do not match', () => {
    const rule: Rule = {
      rule_id: 'test-rule-3',
      rule_type: 'filter',
      name: 'Block Spam',
      enabled: true,
      conditions: [
        { field: 'content', operator: 'contains', value: 'spam' }
      ],
      action: {
        type: 'block',
        parameters: {}
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    ruleEngine.setRule(rule);

    const message = {
      sender: '+15551234567',
      content: 'This is a normal message',
      thread_id: 'test-thread',
      is_group: false
    };

    const matchedRule = ruleEngine.evaluateMessage(message);
    expect(matchedRule).toBeNull();
  });

  test('should handle disabled rules', () => {
    const rule: Rule = {
      rule_id: 'test-rule-4',
      rule_type: 'auto_reply',
      name: 'Disabled Rule',
      enabled: false,
      conditions: [
        { field: 'content', operator: 'contains', value: 'test' }
      ],
      action: {
        type: 'reply',
        parameters: { message: 'Should not reply' }
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    ruleEngine.setRule(rule);

    const message = {
      sender: '+15551234567',
      content: 'test message',
      thread_id: 'test-thread',
      is_group: false
    };

    const matchedRule = ruleEngine.evaluateMessage(message);
    expect(matchedRule).toBeNull();
  });
});
