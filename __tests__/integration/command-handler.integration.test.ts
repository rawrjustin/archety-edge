/**
 * Integration tests for CommandHandler with RuleEngine and PlanManager
 */
import { CommandHandler } from '../../src/commands/CommandHandler';
import { Scheduler } from '../../src/scheduler/Scheduler';
import { RuleEngine } from '../../src/rules/RuleEngine';
import { PlanManager } from '../../src/plans/PlanManager';
import { MockLogger } from '../mocks/MockLogger';
import { MockTransport } from '../mocks/MockTransport';
import * as fs from 'fs';
import * as path from 'path';

describe('CommandHandler Integration', () => {
  let commandHandler: CommandHandler;
  let scheduler: Scheduler;
  let ruleEngine: RuleEngine;
  let planManager: PlanManager;
  let logger: MockLogger;
  let mockTransport: MockTransport;

  const schedulerDbPath = path.join(__dirname, 'test-scheduler.db');
  const rulesDbPath = path.join(__dirname, 'test-rules.db');
  const plansDbPath = path.join(__dirname, 'test-plans.db');

  beforeEach(() => {
    // Clean up test databases
    [schedulerDbPath, rulesDbPath, plansDbPath].forEach(dbPath => {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    });

    logger = new MockLogger();
    mockTransport = new MockTransport();
    scheduler = new Scheduler(schedulerDbPath, mockTransport, logger);
    ruleEngine = new RuleEngine(rulesDbPath, logger);
    planManager = new PlanManager(plansDbPath, logger);
    commandHandler = new CommandHandler(scheduler, mockTransport, logger, ruleEngine, planManager);
  });

  afterEach(() => {
    scheduler.close();
    ruleEngine.close();
    planManager.close();

    [schedulerDbPath, rulesDbPath, plansDbPath].forEach(dbPath => {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    });
  });

  test('should handle set_rule command', async () => {
    const command = {
      command_id: 'cmd-rule-1',
      command_type: 'set_rule',
      payload: {
        rule_type: 'auto_reply',
        rule_config: {
          name: 'Test Rule',
          enabled: true,
          conditions: [
            { field: 'content', operator: 'contains', value: 'hello' }
          ],
          action: {
            type: 'reply',
            parameters: { message: 'Hello!' }
          }
        }
      }
    };

    const result = await commandHandler.executeCommand(command);
    expect(result.success).toBe(true);

    const rule = ruleEngine.getRule('cmd-rule-1');
    expect(rule).not.toBeNull();
    expect(rule?.name).toBe('Test Rule');
  });

  test('should handle update_plan command', async () => {
    const command = {
      command_id: 'cmd-plan-1',
      command_type: 'update_plan',
      payload: {
        thread_id: 'thread-test',
        plan_data: {
          goal: 'Test goal',
          status: 'active'
        }
      }
    };

    const result = await commandHandler.executeCommand(command);
    expect(result.success).toBe(true);

    const plan = planManager.getPlan('thread-test');
    expect(plan).not.toBeNull();
    expect(plan?.plan_data.goal).toBe('Test goal');
  });

  test('should reject set_rule with invalid rule_type', async () => {
    const command = {
      command_id: 'cmd-rule-invalid',
      command_type: 'set_rule',
      payload: {
        rule_type: 'invalid_type',
        rule_config: {
          name: 'Invalid Rule',
          conditions: [],
          action: { type: 'reply', parameters: {} }
        }
      }
    };

    const result = await commandHandler.executeCommand(command);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid rule_type');
  });

  test('should reject set_rule without conditions', async () => {
    const command = {
      command_id: 'cmd-rule-nocond',
      command_type: 'set_rule',
      payload: {
        rule_type: 'auto_reply',
        rule_config: {
          name: 'No Conditions',
          conditions: [],
          action: { type: 'reply', parameters: { message: 'Hello' } }
        }
      }
    };

    const result = await commandHandler.executeCommand(command);
    expect(result.success).toBe(false);
    expect(result.error).toContain('at least one condition');
  });

  test('should get active rules count', () => {
    const rule1 = {
      rule_id: 'rule-1',
      rule_type: 'auto_reply' as any,
      name: 'Rule 1',
      enabled: true,
      conditions: [{ field: 'content' as any, operator: 'contains' as any, value: 'test' }],
      action: { type: 'reply' as any, parameters: { message: 'Test' } },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const rule2 = {
      ...rule1,
      rule_id: 'rule-2',
      name: 'Rule 2',
      enabled: false
    };

    ruleEngine.setRule(rule1);
    ruleEngine.setRule(rule2);

    const count = commandHandler.getActiveRulesCount();
    expect(count).toBe(1); // Only enabled rule
  });
});
