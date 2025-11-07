/**
 * Integration tests for PlanManager
 */
import { PlanManager } from '../../src/plans/PlanManager';
import { MockLogger } from '../mocks/MockLogger';
import * as fs from 'fs';
import * as path from 'path';

describe('PlanManager Integration', () => {
  let planManager: PlanManager;
  let logger: MockLogger;
  const testDbPath = path.join(__dirname, 'test-plans.db');

  beforeEach(() => {
    // Clean up test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    logger = new MockLogger();
    planManager = new PlanManager(testDbPath, logger);
  });

  afterEach(() => {
    planManager.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('should create and retrieve a plan', () => {
    const planData = {
      goal: 'Help user with task',
      context: 'User asked about weather',
      next_steps: ['Get location', 'Fetch weather', 'Respond']
    };

    planManager.setPlan('thread-123', planData);
    const retrieved = planManager.getPlan('thread-123');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.thread_id).toBe('thread-123');
    expect(retrieved?.plan_data.goal).toBe('Help user with task');
    expect(retrieved?.version).toBe(1);
  });

  test('should update existing plan and increment version', () => {
    const planData1 = { status: 'active', step: 1 };
    const planData2 = { status: 'active', step: 2 };

    planManager.setPlan('thread-456', planData1);
    planManager.setPlan('thread-456', planData2);

    const retrieved = planManager.getPlan('thread-456');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.version).toBe(2);
    expect(retrieved?.plan_data.step).toBe(2);
  });

  test('should merge plan data', () => {
    const initial = { goal: 'Test goal', status: 'active' };
    const update = { status: 'completed', result: 'success' };

    planManager.setPlan('thread-789', initial);
    planManager.mergePlan('thread-789', update);

    const retrieved = planManager.getPlan('thread-789');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.plan_data.goal).toBe('Test goal');
    expect(retrieved?.plan_data.status).toBe('completed');
    expect(retrieved?.plan_data.result).toBe('success');
  });

  test('should delete a plan', () => {
    planManager.setPlan('thread-delete', { data: 'test' });
    expect(planManager.getPlan('thread-delete')).not.toBeNull();

    const deleted = planManager.deletePlan('thread-delete');
    expect(deleted).toBe(true);
    expect(planManager.getPlan('thread-delete')).toBeNull();
  });

  test('should get all plans', () => {
    planManager.setPlan('thread-1', { name: 'Plan 1' });
    planManager.setPlan('thread-2', { name: 'Plan 2' });
    planManager.setPlan('thread-3', { name: 'Plan 3' });

    const allPlans = planManager.getAllPlans();
    expect(allPlans).toHaveLength(3);
  });

  test('should get statistics', () => {
    planManager.setPlan('thread-1', { data: 'test' });
    planManager.setPlan('thread-2', { data: 'test' });

    const stats = planManager.getStats();
    expect(stats.total).toBe(2);
  });
});
