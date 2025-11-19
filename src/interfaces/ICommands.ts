/**
 * Command and Event interfaces for Edge Agent sync protocol
 */

// ==================== COMMANDS (Backend → Edge) ====================

export interface ScheduleMessageCommand {
  command_type: 'schedule_message';
  payload: {
    thread_id: string;
    message_text: string;
    send_at: string; // ISO timestamp
    is_group?: boolean;
  };
}

export interface CancelScheduledCommand {
  command_type: 'cancel_scheduled';
  payload: {
    schedule_id: string;
  };
}

export interface SetRuleCommand {
  command_type: 'set_rule';
  payload: {
    rule_type: string;
    rule_config: any;
  };
}

export interface UpdatePlanCommand {
  command_type: 'update_plan';
  payload: {
    thread_id: string;
    plan_data: any;
  };
}

export interface SendMessageNowCommand {
  command_type: 'send_message_now';
  payload: {
    thread_id: string;
    text: string;
    bubble_type?: 'reflex' | 'burst' | 'normal';
  };
}

export interface ContextUpdateCommand {
  command_type: 'context_update';
  payload: {
    chat_guid: string;
    thread_id: string;
    app_id: string;
    room_id?: string;
    state?: 'active' | 'completed';
    metadata?: any;
    notify_text?: string;
  };
}

export interface ContextResetCommand {
  command_type: 'context_reset';
  payload: {
    chat_guid: string;
    thread_id: string;
    reason?: string;
    notify_text?: string;
  };
}

export interface UploadRetryCommand {
  command_type: 'upload_retry';
  payload: {
    attachment_guid: string;
    chat_guid?: string;
    thread_id?: string;
    reason?: string;
    retry_count?: number;
  };
}

export interface EmitEventCommand {
  command_type: 'emit_event';
  payload: {
    event_type: string;
    chat_guid?: string;
    thread_id?: string;
    room_id?: string;
    event_data?: any;
  };
}

export type EdgeCommand =
  | ScheduleMessageCommand
  | CancelScheduledCommand
  | SetRuleCommand
  | UpdatePlanCommand
  | SendMessageNowCommand
  | ContextUpdateCommand
  | ContextResetCommand
  | UploadRetryCommand
  | EmitEventCommand;

export interface EdgeCommandWrapper {
  command_id: string;
  command_type: string;
  payload: any;
  timestamp?: string;  // ISO8601 timestamp
  priority?: 'normal' | 'immediate';  // Command priority
}

// ==================== EVENTS (Edge → Backend) ====================

export interface MessageSentEvent {
  event_type: 'message_sent';
  details: {
    schedule_id?: string;
    thread_id: string;
    message_text: string;
    sent_at: string;
  };
}

export interface MessageFilteredEvent {
  event_type: 'message_filtered';
  details: {
    thread_id: string;
    original_length: number;
    filtered_length: number;
    redacted_fields: string[];
    filter_reason: string;
  };
}

export interface RuleTriggeredEvent {
  event_type: 'rule_triggered';
  details: {
    rule_id: string;
    action_taken: string;
  };
}

export interface ErrorEvent {
  event_type: 'error';
  details: {
    error_type: string;
    message: string;
    context?: any;
  };
}

export type EdgeEvent =
  | MessageSentEvent
  | MessageFilteredEvent
  | RuleTriggeredEvent
  | ErrorEvent;

export interface EdgeEventWrapper {
  event_id: string;
  event_type: string;
  thread_id?: string;
  details: any;
}

// ==================== SYNC PROTOCOL ====================

export interface SyncRequest {
  edge_agent_id: string;
  last_command_id: string | null;
  pending_events: EdgeEventWrapper[];
  status: {
    scheduled_messages: number;
    active_rules: number;
    uptime_seconds: number;
  };
}

export interface SyncResponse {
  commands: EdgeCommandWrapper[];
  ack_events: string[];
  config_updates?: {
    sync_interval?: number;
    [key: string]: any;
  };
}
