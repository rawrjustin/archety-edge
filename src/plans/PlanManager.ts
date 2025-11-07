import { ILogger } from '../interfaces/ILogger';
import Database from 'better-sqlite3';

/**
 * Plan data structure for a conversation thread
 */
export interface Plan {
  thread_id: string;
  plan_data: any;  // Flexible plan structure from backend
  created_at: string;
  updated_at: string;
  version: number;
}

/**
 * PlanManager - Manages conversation plans for threads
 * Plans provide context about ongoing conversations, goals, and state
 */
export class PlanManager {
  private db: Database.Database;
  private logger: ILogger;

  constructor(dbPath: string, logger: ILogger) {
    this.logger = logger;
    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  /**
   * Initialize the plans database
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        thread_id TEXT PRIMARY KEY,
        plan_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_plans_updated ON plans(updated_at);
    `);
  }

  /**
   * Set or update a plan for a thread
   */
  setPlan(threadId: string, planData: any): void {
    const existing = this.getPlan(threadId);
    const now = new Date().toISOString();

    if (existing) {
      // Update existing plan
      const stmt = this.db.prepare(`
        UPDATE plans
        SET plan_data = ?, updated_at = ?, version = version + 1
        WHERE thread_id = ?
      `);
      stmt.run(JSON.stringify(planData), now, threadId);
      this.logger.info(`📝 Plan updated for thread ${threadId} (v${existing.version + 1})`);
    } else {
      // Insert new plan
      const stmt = this.db.prepare(`
        INSERT INTO plans (thread_id, plan_data, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, 1)
      `);
      stmt.run(threadId, JSON.stringify(planData), now, now);
      this.logger.info(`📝 Plan created for thread ${threadId}`);
    }
  }

  /**
   * Get the plan for a thread
   */
  getPlan(threadId: string): Plan | null {
    const stmt = this.db.prepare(`
      SELECT * FROM plans WHERE thread_id = ?
    `);
    const row = stmt.get(threadId) as any;

    if (!row) {
      return null;
    }

    return {
      thread_id: row.thread_id,
      plan_data: JSON.parse(row.plan_data),
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: row.version
    };
  }

  /**
   * Get all plans
   */
  getAllPlans(): Plan[] {
    const stmt = this.db.prepare(`
      SELECT * FROM plans ORDER BY updated_at DESC
    `);
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      thread_id: row.thread_id,
      plan_data: JSON.parse(row.plan_data),
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: row.version
    }));
  }

  /**
   * Delete a plan
   */
  deletePlan(threadId: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM plans WHERE thread_id = ?`);
    const result = stmt.run(threadId);

    if (result.changes > 0) {
      this.logger.info(`Plan for thread ${threadId} deleted`);
      return true;
    }

    return false;
  }

  /**
   * Get plan statistics
   */
  getStats(): { total: number } {
    const result = this.db.prepare(`SELECT COUNT(*) as count FROM plans`).get() as any;
    return { total: result.count };
  }

  /**
   * Merge plan data with existing plan
   * Useful for partial updates
   */
  mergePlan(threadId: string, partialData: any): void {
    const existing = this.getPlan(threadId);

    if (existing) {
      // Merge with existing
      const merged = { ...existing.plan_data, ...partialData };
      this.setPlan(threadId, merged);
    } else {
      // Create new plan
      this.setPlan(threadId, partialData);
    }
  }

  /**
   * Get the number of active plans
   */
  getActivePlansCount(): number {
    const stats = this.getStats();
    return stats.total;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
