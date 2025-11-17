import { ILogger } from '../interfaces/ILogger';
import Database from 'better-sqlite3';

/**
 * Rule types supported by the rule engine
 */
export type RuleType =
  | 'auto_reply'       // Auto-reply to specific senders or keywords
  | 'forward'          // Forward messages matching criteria
  | 'filter'           // Filter/block messages
  | 'schedule_reply';  // Schedule a delayed reply

/**
 * Rule condition for matching messages
 */
export interface RuleCondition {
  field: 'sender' | 'content' | 'thread_id' | 'is_group';
  operator: 'equals' | 'contains' | 'matches' | 'starts_with' | 'ends_with';
  value: string | boolean;
}

/**
 * Rule action to take when conditions match
 */
export interface RuleAction {
  type: 'reply' | 'forward' | 'block' | 'schedule_reply';
  parameters: {
    message?: string;
    delay_seconds?: number;
    forward_to?: string;
    [key: string]: any;
  };
}

/**
 * A rule that can be evaluated against incoming messages
 */
export interface Rule {
  rule_id: string;
  rule_type: RuleType;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  action: RuleAction;
  created_at: string;
  updated_at: string;
}

/**
 * Message to evaluate against rules
 */
export interface IncomingMessage {
  sender: string;
  content: string;
  thread_id: string;
  is_group: boolean;
}

/**
 * RuleEngine - Manages and evaluates rules for incoming messages
 */
export class RuleEngine {
  private db: Database.Database;
  private logger: ILogger;

  constructor(dbPath: string, logger: ILogger) {
    this.logger = logger;
    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  /**
   * Initialize the rules database
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rules (
        rule_id TEXT PRIMARY KEY,
        rule_type TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        conditions TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);
    `);
  }

  /**
   * Add or update a rule
   */
  setRule(rule: Rule): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO rules (
        rule_id, rule_type, name, enabled, conditions, action, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      rule.rule_id,
      rule.rule_type,
      rule.name,
      rule.enabled ? 1 : 0,
      JSON.stringify(rule.conditions),
      JSON.stringify(rule.action),
      rule.created_at,
      rule.updated_at
    );

    this.logger.info(`Rule ${rule.rule_id} (${rule.name}) saved`);
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): Rule | null {
    const stmt = this.db.prepare(`
      SELECT * FROM rules WHERE rule_id = ?
    `);
    const row = stmt.get(ruleId) as any;

    if (!row) {
      return null;
    }

    return this.rowToRule(row);
  }

  /**
   * Get all rules
   */
  getAllRules(): Rule[] {
    const stmt = this.db.prepare(`
      SELECT * FROM rules ORDER BY created_at DESC
    `);
    const rows = stmt.all() as any[];

    return rows.map(row => this.rowToRule(row));
  }

  /**
   * Get all enabled rules
   */
  getEnabledRules(): Rule[] {
    const stmt = this.db.prepare(`
      SELECT * FROM rules WHERE enabled = 1 ORDER BY created_at DESC
    `);
    const rows = stmt.all() as any[];

    return rows.map(row => this.rowToRule(row));
  }

  /**
   * Enable a rule
   */
  enableRule(ruleId: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE rules SET enabled = 1, updated_at = ?
      WHERE rule_id = ?
    `);
    const result = stmt.run(new Date().toISOString(), ruleId);

    if (result.changes > 0) {
      this.logger.info(`Rule ${ruleId} enabled`);
      return true;
    }

    return false;
  }

  /**
   * Disable a rule
   */
  disableRule(ruleId: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE rules SET enabled = 0, updated_at = ?
      WHERE rule_id = ?
    `);
    const result = stmt.run(new Date().toISOString(), ruleId);

    if (result.changes > 0) {
      this.logger.info(`Rule ${ruleId} disabled`);
      return true;
    }

    return false;
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM rules WHERE rule_id = ?`);
    const result = stmt.run(ruleId);

    if (result.changes > 0) {
      this.logger.info(`Rule ${ruleId} deleted`);
      return true;
    }

    return false;
  }

  /**
   * Evaluate a message against all enabled rules
   * Returns the first matching rule or null
   */
  evaluateMessage(message: IncomingMessage): Rule | null {
    const rules = this.getEnabledRules();

    for (const rule of rules) {
      if (this.matchesRule(message, rule)) {
        this.logger.info(`Message matched rule: ${rule.name} (${rule.rule_id})`);
        return rule;
      }
    }

    return null;
  }

  /**
   * Check if a message matches a rule's conditions
   */
  private matchesRule(message: IncomingMessage, rule: Rule): boolean {
    // All conditions must match (AND logic)
    for (const condition of rule.conditions) {
      if (!this.matchesCondition(message, condition)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a message matches a single condition
   */
  private matchesCondition(message: IncomingMessage, condition: RuleCondition): boolean {
    let fieldValue: string | boolean;

    switch (condition.field) {
      case 'sender':
        fieldValue = message.sender;
        break;
      case 'content':
        fieldValue = message.content;
        break;
      case 'thread_id':
        fieldValue = message.thread_id;
        break;
      case 'is_group':
        fieldValue = message.is_group;
        break;
      default:
        return false;
    }

    // Handle boolean conditions
    if (typeof fieldValue === 'boolean') {
      return condition.operator === 'equals' && fieldValue === condition.value;
    }

    // Handle string conditions
    const conditionValue = String(condition.value).toLowerCase();
    const messageValue = fieldValue.toLowerCase();

    switch (condition.operator) {
      case 'equals':
        return messageValue === conditionValue;
      case 'contains':
        return messageValue.includes(conditionValue);
      case 'starts_with':
        return messageValue.startsWith(conditionValue);
      case 'ends_with':
        return messageValue.endsWith(conditionValue);
      case 'matches':
        try {
          const regex = new RegExp(conditionValue, 'i');
          return regex.test(messageValue);
        } catch {
          this.logger.warn(`Invalid regex in rule condition: ${conditionValue}`);
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * Get rule statistics
   */
  getStats(): { total: number; enabled: number } {
    const total = this.db.prepare(`SELECT COUNT(*) as count FROM rules`).get() as any;
    const enabled = this.db.prepare(`SELECT COUNT(*) as count FROM rules WHERE enabled = 1`).get() as any;

    return {
      total: total.count,
      enabled: enabled.count
    };
  }

  /**
   * Convert database row to Rule object
   */
  private rowToRule(row: any): Rule {
    return {
      rule_id: row.rule_id,
      rule_type: row.rule_type,
      name: row.name,
      enabled: row.enabled === 1,
      conditions: JSON.parse(row.conditions),
      action: JSON.parse(row.action),
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
