import { ILogger } from '../interfaces/ILogger';
import { Scheduler } from '../scheduler/Scheduler';
import {
  EdgeCommandWrapper,
  ScheduleMessageCommand,
  CancelScheduledCommand,
  SetRuleCommand,
  UpdatePlanCommand,
  SendMessageNowCommand,
  ContextUpdateCommand,
  ContextResetCommand
} from '../interfaces/ICommands';
import { RuleEngine, Rule } from '../rules/RuleEngine';
import { PlanManager } from '../plans/PlanManager';
import { IMessageTransport } from '../interfaces/IMessageTransport';
import { ContextManager } from '../context/ContextManager';
import {
  validateThreadId,
  validateMessageText,
  validateTimestamp,
  validateScheduleId,
  validateAppId,
  validateBoolean,
  validateObjectDepth,
  validateJsonSize
} from '../utils/validation';

/**
 * CommandHandler - Processes commands from backend
 */
export class CommandHandler {
  private logger: ILogger;
  private scheduler: Scheduler;
  private transport: IMessageTransport;
  private ruleEngine: RuleEngine | null = null;
  private planManager: PlanManager | null = null;
  private contextManager: ContextManager | null = null;

  constructor(
    scheduler: Scheduler,
    transport: IMessageTransport,
    logger: ILogger,
    ruleEngine?: RuleEngine,
    planManager?: PlanManager,
    contextManager?: ContextManager
  ) {
    this.scheduler = scheduler;
    this.transport = transport;
    this.logger = logger;
    this.ruleEngine = ruleEngine || null;
    this.planManager = planManager || null;
    this.contextManager = contextManager || null;
  }

  /**
   * Execute a command from the backend
   * Returns true if successful, false otherwise
   */
  async executeCommand(command: EdgeCommandWrapper): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info(`Executing command ${command.command_id}: ${command.command_type}`);

      switch (command.command_type) {
        case 'send_message_now':
          return await this.handleSendMessageNow(command);

        case 'schedule_message':
          return await this.handleScheduleMessage(command);

        case 'cancel_scheduled':
          return await this.handleCancelScheduled(command);

        case 'set_rule':
          return await this.handleSetRule(command);

        case 'update_plan':
          return await this.handleUpdatePlan(command);

        case 'context_update':
          return await this.handleContextUpdate(command);

        case 'context_reset':
          return await this.handleContextReset(command);

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
   * Handle send_message_now command (for instant reflex delivery via WebSocket)
   */
  private async handleSendMessageNow(
    command: EdgeCommandWrapper
  ): Promise<{ success: boolean; error?: string }> {
    const payload = command.payload as SendMessageNowCommand['payload'];

    try {
      // Validate required fields
      if (!payload.thread_id || !payload.text) {
        return {
          success: false,
          error: 'Missing required fields: thread_id and text'
        };
      }

      // Validate thread_id
      const threadIdValidation = validateThreadId(payload.thread_id);
      if (!threadIdValidation.valid) {
        return { success: false, error: `Invalid thread_id: ${threadIdValidation.error}` };
      }

      // Validate and sanitize message text
      const textValidation = validateMessageText(payload.text, 10000);
      if (!textValidation.valid) {
        return { success: false, error: `Invalid text: ${textValidation.error}` };
      }

      const sanitizedThreadId = threadIdValidation.sanitized!;
      const sanitizedText = textValidation.sanitized!;

      // Parse thread_id to determine if it's a group chat
      const isGroup = sanitizedThreadId.includes('chat');

      // Log the immediate send
      const bubbleType = payload.bubble_type || 'normal';
      this.logger.info('='.repeat(60));
      this.logger.info(`⚡ SENDING ${bubbleType.toUpperCase()} MESSAGE IMMEDIATELY via WebSocket`);
      this.logger.info(`   Thread: ${sanitizedThreadId}`);
      this.logger.info(`   Text: "${sanitizedText.substring(0, 100)}${sanitizedText.length > 100 ? '...' : ''}"`); // Truncate long text in logs
      this.logger.info(`   Type: ${bubbleType}`);
      this.logger.info('='.repeat(60));

      // Send immediately via transport
      const sent = await this.transport.sendMessage(
        sanitizedThreadId,
        sanitizedText,
        isGroup
      );

      if (sent) {
        this.logger.info(`✅ ${bubbleType.toUpperCase()} message DELIVERED to iMessage via WebSocket`);
        return { success: true };
      } else {
        return {
          success: false,
          error: 'Failed to send message via transport'
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to send message now: ${error.message}`
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
      // Validate required fields
      if (!payload.thread_id || !payload.message_text || !payload.send_at) {
        return {
          success: false,
          error: 'Missing required fields: thread_id, message_text, and send_at'
        };
      }

      // Validate thread_id
      const threadIdValidation = validateThreadId(payload.thread_id);
      if (!threadIdValidation.valid) {
        return { success: false, error: `Invalid thread_id: ${threadIdValidation.error}` };
      }

      // Validate message text
      const textValidation = validateMessageText(payload.message_text, 10000);
      if (!textValidation.valid) {
        return { success: false, error: `Invalid message_text: ${textValidation.error}` };
      }

      // Validate timestamp
      const timestampValidation = validateTimestamp(payload.send_at);
      if (!timestampValidation.valid) {
        return { success: false, error: `Invalid send_at: ${timestampValidation.error}` };
      }

      // Validate is_group if provided
      if (payload.is_group !== undefined) {
        const isGroupValidation = validateBoolean(payload.is_group, 'is_group');
        if (!isGroupValidation.valid) {
          return { success: false, error: isGroupValidation.error };
        }
      }

      const sanitizedThreadId = threadIdValidation.sanitized!;
      const sanitizedText = textValidation.sanitized!;
      const sendAt = new Date(timestampValidation.sanitized!);

      // Schedule the message
      const scheduleId = this.scheduler.scheduleMessage(
        sanitizedThreadId,
        sanitizedText,
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
      // Validate schedule_id
      if (!payload.schedule_id) {
        return { success: false, error: 'Missing required field: schedule_id' };
      }

      const scheduleIdValidation = validateScheduleId(payload.schedule_id);
      if (!scheduleIdValidation.valid) {
        return { success: false, error: `Invalid schedule_id: ${scheduleIdValidation.error}` };
      }

      const cancelled = this.scheduler.cancelMessage(scheduleIdValidation.sanitized!);

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
   * Handle context_update command
   */
  private async handleContextUpdate(
    command: EdgeCommandWrapper
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.contextManager) {
      return { success: false, error: 'Context manager not initialized' };
    }

    const payload = command.payload as ContextUpdateCommand['payload'];

    // Validate required fields
    if (!payload.chat_guid || !payload.app_id || !payload.thread_id) {
      return { success: false, error: 'chat_guid, app_id, and thread_id are required' };
    }

    // Validate thread_id
    const threadIdValidation = validateThreadId(payload.thread_id);
    if (!threadIdValidation.valid) {
      return { success: false, error: `Invalid thread_id: ${threadIdValidation.error}` };
    }

    // Validate chat_guid (same format as thread_id)
    const chatGuidValidation = validateThreadId(payload.chat_guid);
    if (!chatGuidValidation.valid) {
      return { success: false, error: `Invalid chat_guid: ${chatGuidValidation.error}` };
    }

    // Validate app_id
    const appIdValidation = validateAppId(payload.app_id);
    if (!appIdValidation.valid) {
      return { success: false, error: `Invalid app_id: ${appIdValidation.error}` };
    }

    // Validate metadata if provided (check depth and size)
    if (payload.metadata) {
      const depthValidation = validateObjectDepth(payload.metadata, 10);
      if (!depthValidation.valid) {
        return { success: false, error: `Invalid metadata: ${depthValidation.error}` };
      }

      const sizeValidation = validateJsonSize(payload.metadata, 100 * 1024); // 100KB max
      if (!sizeValidation.valid) {
        return { success: false, error: `Invalid metadata: ${sizeValidation.error}` };
      }
    }

    // Validate notify_text if provided
    if (payload.notify_text) {
      const notifyTextValidation = validateMessageText(payload.notify_text, 5000);
      if (!notifyTextValidation.valid) {
        return { success: false, error: `Invalid notify_text: ${notifyTextValidation.error}` };
      }
    }

    this.contextManager.upsertContext({
      chatGuid: chatGuidValidation.sanitized!,
      appId: appIdValidation.sanitized!,
      roomId: payload.room_id,
      state: payload.state || 'active',
      metadata: payload.metadata
    });

    if (payload.notify_text) {
      const textValidation = validateMessageText(payload.notify_text, 5000);
      const isGroup = threadIdValidation.sanitized!.includes('chat');
      await this.transport.sendMessage(
        threadIdValidation.sanitized!,
        textValidation.sanitized!,
        isGroup
      );
    }

    return { success: true };
  }

  /**
   * Handle context_reset command
   */
  private async handleContextReset(
    command: EdgeCommandWrapper
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.contextManager) {
      return { success: false, error: 'Context manager not initialized' };
    }

    const payload = command.payload as ContextResetCommand['payload'];

    // Validate required fields
    if (!payload.chat_guid || !payload.thread_id) {
      return { success: false, error: 'chat_guid and thread_id are required' };
    }

    // Validate thread_id
    const threadIdValidation = validateThreadId(payload.thread_id);
    if (!threadIdValidation.valid) {
      return { success: false, error: `Invalid thread_id: ${threadIdValidation.error}` };
    }

    // Validate chat_guid
    const chatGuidValidation = validateThreadId(payload.chat_guid);
    if (!chatGuidValidation.valid) {
      return { success: false, error: `Invalid chat_guid: ${chatGuidValidation.error}` };
    }

    // Validate notify_text if provided
    if (payload.notify_text) {
      const notifyTextValidation = validateMessageText(payload.notify_text, 5000);
      if (!notifyTextValidation.valid) {
        return { success: false, error: `Invalid notify_text: ${notifyTextValidation.error}` };
      }
    }

    this.contextManager.clearContext(chatGuidValidation.sanitized!);

    if (payload.notify_text) {
      const textValidation = validateMessageText(payload.notify_text, 5000);
      const isGroup = threadIdValidation.sanitized!.includes('chat');
      await this.transport.sendMessage(
        threadIdValidation.sanitized!,
        textValidation.sanitized!,
        isGroup
      );
    }

    return { success: true };
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
