import { ILogger } from '../interfaces/ILogger';
import { Scheduler } from '../scheduler/Scheduler';
import {
  EdgeCommandWrapper,
  ScheduleMessageCommand,
  CancelScheduledCommand,
  SetRuleCommand,
  UpdatePlanCommand
} from '../interfaces/ICommands';
import { RuleEngine, Rule } from '../rules/RuleEngine';
import { PlanManager } from '../plans/PlanManager';

/**
 * CommandHandler - Processes commands from backend
 */
export class CommandHandler {
  private logger: ILogger;
  private scheduler: Scheduler;
  private ruleEngine: RuleEngine | null = null;
  private planManager: PlanManager | null = null;

  constructor(scheduler: Scheduler, logger: ILogger, ruleEngine?: RuleEngine, planManager?: PlanManager) {
    this.scheduler = scheduler;
    this.logger = logger;
    this.ruleEngine = ruleEngine || null;
    this.planManager = planManager || null;
  }

  /**
   * Execute a command from the backend
   * Returns true if successful, false otherwise
   */
  async executeCommand(command: EdgeCommandWrapper): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info(`Executing command ${command.command_id}: ${command.command_type}`);

      switch (command.command_type) {
        case 'schedule_message':
          return await this.handleScheduleMessage(command);

        case 'cancel_scheduled':
          return await this.handleCancelScheduled(command);

        case 'set_rule':
          return await this.handleSetRule(command);

        case 'update_plan':
          return await this.handleUpdatePlan(command);

        default:
          this.logger.warn(`Unknown command type: ${command.command_type}`);
          return {
            success: false,
            error: `Unknown command type: ${command.command_type}`
          };
      }
    } catch (error: any) {
      this.logger.error(`Error executing command ${command.command_id}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle schedule_message command
   */
  private async handleScheduleMessage(
    command: EdgeCommandWrapper
  ): Promise<{ success: boolean; error?: string }> {
    const payload = command.payload as ScheduleMessageCommand['payload'];

    try {
      const sendAt = new Date(payload.send_at);

      // Validate timestamp
      if (isNaN(sendAt.getTime())) {
        return {
          success: false,
          error: `Invalid timestamp: ${payload.send_at}`
        };
      }

      // Schedule the message
      const scheduleId = this.scheduler.scheduleMessage(
        payload.thread_id,
        payload.message_text,
        sendAt,
        payload.is_group || false,
        command.command_id
      );

      const now = new Date();
      const isImmediate = sendAt <= now || command.priority === 'immediate';

      if (isImmediate) {
        this.logger.info(`⚡ Message scheduled for immediate send (send_at: ${sendAt.toISOString()}, priority: ${command.priority})`);
        // Trigger immediate scheduler check for messages due now or in the past
        setImmediate(() => this.scheduler.checkNow());
      } else {
        this.logger.info(`📅 Scheduled message ${scheduleId} for ${sendAt.toISOString()}`);
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to schedule message: ${error.message}`
      };
    }
  }

  /**
   * Handle cancel_scheduled command
   */
  private async handleCancelScheduled(
    command: EdgeCommandWrapper
  ): Promise<{ success: boolean; error?: string }> {
    const payload = command.payload as CancelScheduledCommand['payload'];

    try {
      const cancelled = this.scheduler.cancelMessage(payload.schedule_id);

      if (cancelled) {
        this.logger.info(`Cancelled scheduled message ${payload.schedule_id}`);
        return { success: true };
      } else {
        return {
          success: false,
          error: `Message ${payload.schedule_id} not found or already sent`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to cancel message: ${error.message}`
      };
    }
  }

  /**
   * Handle set_rule command
   */
  private async handleSetRule(
    command: EdgeCommandWrapper
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.ruleEngine) {
      this.logger.warn('set_rule command received but rule engine not initialized');
      return {
        success: false,
        error: 'Rule engine not initialized'
      };
    }

    const payload = command.payload as SetRuleCommand['payload'];

    try {
      // Validate rule_type
      const validRuleTypes = ['auto_reply', 'forward', 'filter', 'schedule_reply'];
      if (!validRuleTypes.includes(payload.rule_type)) {
        return {
          success: false,
          error: `Invalid rule_type: ${payload.rule_type}. Must be one of: ${validRuleTypes.join(', ')}`
        };
      }

      // Create rule from payload
      const rule: Rule = {
        rule_id: command.command_id,
        rule_type: payload.rule_type as any,
        name: payload.rule_config.name || `Rule ${command.command_id}`,
        enabled: payload.rule_config.enabled !== false,
        conditions: payload.rule_config.conditions || [],
        action: payload.rule_config.action,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Validate rule has required fields
      if (!rule.conditions || rule.conditions.length === 0) {
        return {
          success: false,
          error: 'Rule must have at least one condition'
        };
      }

      if (!rule.action || !rule.action.type) {
        return {
          success: false,
          error: 'Rule must have an action'
        };
      }

      // Save the rule
      this.ruleEngine.setRule(rule);

      this.logger.info(`✅ Rule ${rule.rule_id} (${rule.name}) created/updated`);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to set rule: ${error.message}`
      };
    }
  }

  /**
   * Handle update_plan command
   */
  private async handleUpdatePlan(
    command: EdgeCommandWrapper
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.planManager) {
      this.logger.warn('update_plan command received but plan manager not initialized');
      return {
        success: false,
        error: 'Plan manager not initialized'
      };
    }

    const payload = command.payload as UpdatePlanCommand['payload'];

    try {
      // Validate thread_id
      if (!payload.thread_id) {
        return {
          success: false,
          error: 'thread_id is required'
        };
      }

      // Validate plan_data
      if (!payload.plan_data) {
        return {
          success: false,
          error: 'plan_data is required'
        };
      }

      // Update the plan
      this.planManager.setPlan(payload.thread_id, payload.plan_data);

      this.logger.info(`✅ Plan updated for thread ${payload.thread_id}`);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to update plan: ${error.message}`
      };
    }
  }

  /**
   * Get the rule engine instance
   */
  getRuleEngine(): RuleEngine | null {
    return this.ruleEngine;
  }

  /**
   * Get the plan manager instance
   */
  getPlanManager(): PlanManager | null {
    return this.planManager;
  }

  /**
   * Get the number of active rules
   */
  getActiveRulesCount(): number {
    if (!this.ruleEngine) {
      return 0;
    }
    const stats = this.ruleEngine.getStats();
    return stats.enabled;
  }
}
