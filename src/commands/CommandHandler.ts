import { ILogger } from '../interfaces/ILogger';
import { Scheduler } from '../scheduler/Scheduler';
import {
  EdgeCommandWrapper,
  ScheduleMessageCommand,
  CancelScheduledCommand
} from '../interfaces/ICommands';

/**
 * CommandHandler - Processes commands from backend
 */
export class CommandHandler {
  private logger: ILogger;
  private scheduler: Scheduler;

  constructor(scheduler: Scheduler, logger: ILogger) {
    this.scheduler = scheduler;
    this.logger = logger;
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

      this.logger.info(`Scheduled message ${scheduleId} for ${sendAt.toISOString()}`);

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
   * Handle set_rule command (placeholder for future implementation)
   */
  private async handleSetRule(
    command: EdgeCommandWrapper
  ): Promise<{ success: boolean; error?: string }> {
    this.logger.info('set_rule command received (not yet implemented)');
    return {
      success: false,
      error: 'Rule engine not yet implemented'
    };
  }

  /**
   * Handle update_plan command (placeholder for future implementation)
   */
  private async handleUpdatePlan(
    command: EdgeCommandWrapper
  ): Promise<{ success: boolean; error?: string }> {
    this.logger.info('update_plan command received (not yet implemented)');
    return {
      success: false,
      error: 'Plan updates not yet implemented'
    };
  }
}
