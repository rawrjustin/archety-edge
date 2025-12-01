import express, { Request, Response } from 'express';
import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Tail } from 'tail';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface AdminStats {
  uptime_seconds: number;
  scheduled_messages: number;
  active_rules: number;
  websocket_connected: boolean;
  http_fallback_active: boolean;
  messages_processed: number;
  messages_sent: number;
  last_message_time: string | null;
  edge_agent_id: string;
  backend_url: string;
  imessage_poll_interval: number;
  performance_profile: string;
}

export interface IAdminInterface {
  getStats(): Promise<AdminStats>;
  getScheduledMessages(): Promise<any[]>;
  getRules(): Promise<any[]>;
  getPlans(): Promise<any[]>;
  cancelScheduledMessage(scheduleId: string): Promise<void>;
  enableRule(ruleId: string): Promise<void>;
  disableRule(ruleId: string): Promise<void>;
  sendTestMessage(threadId: string, text: string): Promise<void>;
  testBackendConnection(): Promise<{ healthy: boolean; latency: number }>;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
  blockedUntil?: number;
}

export class AdminServer {
  private app: express.Application;
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private adminInterface: IAdminInterface;
  private config: any;
  private logTail: Tail | null = null;
  private logClients: Set<WebSocket> = new Set();
  private authToken: string;
  private port: number;
  private rateLimitStore: Map<string, RateLimitEntry> = new Map();

  constructor(adminInterface: IAdminInterface, configPath: string, port: number = 3100) {
    this.adminInterface = adminInterface;
    this.port = port;
    this.app = express();

    // Load config
    this.config = this.loadConfig(configPath);

    // Initialize auth token securely
    this.authToken = this.initializeAuthToken();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private loadConfig(configPath: string): any {
    try {
      const configFile = fs.readFileSync(configPath, 'utf8');
      return yaml.load(configFile);
    } catch (error) {
      console.error('Failed to load config:', error);
      return {};
    }
  }

  /**
   * Initialize admin authentication token securely
   * Priority: ADMIN_TOKEN env var > persisted token > generate new
   */
  private initializeAuthToken(): string {
    // Priority 1: Explicit ADMIN_TOKEN environment variable
    if (process.env.ADMIN_TOKEN) {
      console.log('Using ADMIN_TOKEN from environment');
      return process.env.ADMIN_TOKEN;
    }

    // Priority 2: Try to retrieve persisted token from secure storage
    try {
      const { execFileSync } = require('child_process');
      const token = execFileSync(
        'security',
        [
          'find-generic-password',
          '-s', 'com.archety.edge.admin',
          '-a', 'admin-portal-token',
          '-w'
        ],
        { encoding: 'utf8' }
      ).trim();

      if (token && token.length > 0) {
        console.log('Using persisted admin token from Keychain');
        return token;
      }
    } catch (error) {
      // Token doesn't exist in keychain, will generate new
    }

    // Priority 3: Generate and persist new token
    const newToken = this.generateToken();
    this.persistToken(newToken);
    console.log('Generated new admin token and persisted to Keychain');
    return newToken;
  }

  /**
   * Generate a cryptographically secure random token
   */
  private generateToken(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }

  /**
   * Persist token to macOS Keychain for reuse across restarts
   */
  private persistToken(token: string): void {
    try {
      const { execFileSync } = require('child_process');
      execFileSync(
        'security',
        [
          'add-generic-password',
          '-U',  // Update if exists
          '-s', 'com.archety.edge.admin',
          '-a', 'admin-portal-token',
          '-w', token,
          '-T', ''  // Allow all applications (or specify specific ones)
        ],
        { stdio: 'ignore' }
      );
      console.log('Admin token persisted to Keychain successfully');
    } catch (error: any) {
      console.warn(`Failed to persist admin token to Keychain: ${error.message}`);
      console.warn('Token will not persist across restarts');
    }
  }

  /**
   * Rate limiting middleware
   * Limits requests per IP address with exponential backoff for repeated violations
   */
  private rateLimitMiddleware(
    windowMs: number = 15 * 60 * 1000, // 15 minutes
    maxRequests: number = 100,
    blockDurationMs: number = 60 * 1000 // 1 minute block after repeated violations
  ) {
    return (req: Request, res: Response, next: () => void) => {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const now = Date.now();

      // Get or create rate limit entry
      let entry = this.rateLimitStore.get(clientIp);

      if (!entry || now > entry.resetAt) {
        // Create new entry or reset expired one
        entry = {
          count: 1,
          resetAt: now + windowMs
        };
        this.rateLimitStore.set(clientIp, entry);
        return next();
      }

      // Check if client is currently blocked
      if (entry.blockedUntil && now < entry.blockedUntil) {
        const remainingSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
        return res.status(429).json({
          error: 'Too many requests',
          message: `Blocked for ${remainingSeconds} more seconds`,
          retryAfter: remainingSeconds
        });
      }

      // Increment request count
      entry.count++;

      // Check if limit exceeded
      if (entry.count > maxRequests) {
        // Block client for a period
        entry.blockedUntil = now + blockDurationMs;
        this.rateLimitStore.set(clientIp, entry);

        const retryAfter = Math.ceil(blockDurationMs / 1000);
        res.setHeader('Retry-After', retryAfter.toString());

        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Blocked for ${retryAfter} seconds`,
          retryAfter
        });
      }

      // Update entry
      this.rateLimitStore.set(clientIp, entry);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
      res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());

      next();
    };
  }

  /**
   * Cleanup old rate limit entries (run periodically)
   */
  private cleanupRateLimitStore(): void {
    const now = Date.now();
    for (const [ip, entry] of this.rateLimitStore.entries()) {
      if (now > entry.resetAt && (!entry.blockedUntil || now > entry.blockedUntil)) {
        this.rateLimitStore.delete(ip);
      }
    }
  }

  /**
   * Validate service script path to prevent command injection
   * Returns absolute path to validated script or throws error
   */
  private validateServiceScript(): string {
    // Use absolute path from project root
    const projectRoot = path.resolve(__dirname, '../..');
    const scriptPath = path.resolve(projectRoot, 'edge-agent.sh');

    // Verify script exists
    if (!fs.existsSync(scriptPath)) {
      throw new Error('Service script not found');
    }

    // Verify script is within project directory (prevent path traversal)
    if (!scriptPath.startsWith(projectRoot)) {
      throw new Error('Invalid script path');
    }

    // Verify script has correct permissions (readable and executable)
    try {
      fs.accessSync(scriptPath, fs.constants.R_OK | fs.constants.X_OK);
    } catch {
      throw new Error('Script not executable');
    }

    return scriptPath;
  }

  /**
   * Validate and sanitize log file path to prevent path traversal attacks
   */
  private validateLogPath(configPath: string): string {
    // Resolve to absolute path
    const logPath = path.resolve(configPath);

    // Get project root directory
    const projectRoot = path.resolve(__dirname, '../..');

    // Verify log file is within project directory
    if (!logPath.startsWith(projectRoot)) {
      throw new Error('Log file must be within project directory');
    }

    // Verify file exists
    if (!fs.existsSync(logPath)) {
      throw new Error('Log file not found');
    }

    // Verify it's a regular file (not a directory or symlink)
    const stats = fs.lstatSync(logPath);
    if (!stats.isFile()) {
      throw new Error('Path is not a regular file');
    }

    return logPath;
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use((req: Request, res: Response, next) => {
      // HTTPS enforcement (in production)
      if (process.env.NODE_ENV === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
        return res.status(403).json({ error: 'HTTPS required' });
      }

      // Security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");

      next();
    });

    // CORS - allow localhost only (include both http and https for dev)
    this.app.use(cors({
      origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://localhost:3000',
        'https://127.0.0.1:3000'
      ],
      credentials: true
    }));

    // Body parser with size limits
    this.app.use(express.json({ limit: '1mb' }));

    // Rate limiting for all API endpoints
    this.app.use('/api/', this.rateLimitMiddleware(
      15 * 60 * 1000, // 15 minute window
      100,            // max 100 requests per window
      60 * 1000       // 1 minute block on violation
    ));

    // Stricter rate limiting for authentication attempts
    this.app.use('/api/auth/', this.rateLimitMiddleware(
      15 * 60 * 1000, // 15 minute window
      10,             // max 10 auth attempts per window
      5 * 60 * 1000   // 5 minute block on violation
    ));

    // Auth middleware - only protect API endpoints
    this.app.use((req: Request, res: Response, next) => {
      // Skip auth for non-API requests (static files, HTML)
      if (!req.path.startsWith('/api/')) {
        return next();
      }

      // Skip auth for public API endpoints
      if (req.path === '/api/health' || req.path === '/api/auth/token') {
        return next();
      }

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token !== this.authToken) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    });

    // Start periodic cleanup of rate limit store (every 5 minutes)
    setInterval(() => this.cleanupRateLimitStore(), 5 * 60 * 1000);
  }

  private setupRoutes(): void {
    // Health check (no auth)
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Get auth token (only show if ADMIN_TOKEN is set)
    this.app.get('/api/auth/token', (req: Request, res: Response) => {
      if (process.env.ADMIN_TOKEN) {
        res.json({ token: this.authToken });
      } else {
        res.status(404).json({ error: 'Admin token not configured' });
      }
    });

    // Stats endpoint
    this.app.get('/api/stats', async (req: Request, res: Response) => {
      try {
        const stats = await this.adminInterface.getStats();
        res.json(stats);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Configuration endpoints
    this.app.get('/api/config', (req: Request, res: Response) => {
      res.json(this.config);
    });

    this.app.put('/api/config', (req: Request, res: Response) => {
      try {
        const newConfig = req.body;
        const configPath = path.join(process.cwd(), 'config.yaml');
        fs.writeFileSync(configPath, yaml.dump(newConfig));
        this.config = newConfig;
        res.json({ success: true, message: 'Configuration updated. Restart required.' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Environment variables (masked)
    this.app.get('/api/env', (req: Request, res: Response) => {
      const env = {
        BACKEND_URL: process.env.BACKEND_URL || 'not set',
        USER_PHONE: process.env.USER_PHONE || 'not set',
        WEBSOCKET_ENABLED: process.env.WEBSOCKET_ENABLED || 'not set',
        PERFORMANCE_PROFILE: process.env.PERFORMANCE_PROFILE || 'not set',
        EDGE_SECRET: process.env.EDGE_SECRET ? '***masked***' : 'not set',
      };
      res.json(env);
    });

    // Scheduled messages
    this.app.get('/api/scheduled', async (req: Request, res: Response) => {
      try {
        const messages = await this.adminInterface.getScheduledMessages();
        res.json(messages);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/api/scheduled/:id', async (req: Request, res: Response) => {
      try {
        await this.adminInterface.cancelScheduledMessage(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Rules
    this.app.get('/api/rules', async (req: Request, res: Response) => {
      try {
        const rules = await this.adminInterface.getRules();
        res.json(rules);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/api/rules/:id/enable', async (req: Request, res: Response) => {
      try {
        await this.adminInterface.enableRule(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/api/rules/:id/disable', async (req: Request, res: Response) => {
      try {
        await this.adminInterface.disableRule(req.params.id);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Plans
    this.app.get('/api/plans', async (req: Request, res: Response) => {
      try {
        const plans = await this.adminInterface.getPlans();
        res.json(plans);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Logs
    this.app.get('/api/logs', (req: Request, res: Response) => {
      try {
        const configLogPath = this.config.logging?.file || './edge-agent.log';
        const lines = parseInt(req.query.lines as string) || 100;

        // Validate log path to prevent path traversal
        let validatedLogPath: string;
        try {
          validatedLogPath = this.validateLogPath(configLogPath);
        } catch (error: any) {
          // Log file doesn't exist or is invalid - return empty array
          return res.json([]);
        }

        // Read file with size limit to prevent DoS
        const stats = fs.statSync(validatedLogPath);
        const maxFileSize = 10 * 1024 * 1024; // 10MB limit

        if (stats.size > maxFileSize) {
          // For large files, read only the last portion
          const fd = fs.openSync(validatedLogPath, 'r');
          const buffer = Buffer.alloc(maxFileSize);
          const bytesRead = fs.readSync(fd, buffer, 0, maxFileSize, stats.size - maxFileSize);
          fs.closeSync(fd);

          const content = buffer.slice(0, bytesRead).toString('utf8');
          const allLines = content.split('\n').filter(line => line.trim());
          const recentLines = allLines.slice(-lines);
          return res.json(recentLines);
        }

        const content = fs.readFileSync(validatedLogPath, 'utf8');
        const allLines = content.split('\n').filter(line => line.trim());
        const recentLines = allLines.slice(-lines);

        res.json(recentLines);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Service control
    this.app.post('/api/service/restart', async (req: Request, res: Response) => {
      try {
        const scriptPath = this.validateServiceScript();
        await execAsync(`"${scriptPath}" restart`, {
          timeout: 10000,
          maxBuffer: 1024 * 1024,
          env: { PATH: process.env.PATH } // Only pass PATH, no other env vars
        });
        res.json({ success: true, message: 'Service restarting...' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/service/stop', async (req: Request, res: Response) => {
      try {
        const scriptPath = this.validateServiceScript();
        await execAsync(`"${scriptPath}" stop`, {
          timeout: 10000,
          maxBuffer: 1024 * 1024,
          env: { PATH: process.env.PATH }
        });
        res.json({ success: true, message: 'Service stopped' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/service/status', async (req: Request, res: Response) => {
      try {
        const scriptPath = this.validateServiceScript();
        const { stdout } = await execAsync(`"${scriptPath}" status`, {
          timeout: 5000,
          maxBuffer: 1024 * 1024,
          env: { PATH: process.env.PATH }
        });
        res.json({ status: stdout.trim() });
      } catch (error: any) {
        res.status(500).json({ error: error.message, status: 'unknown' });
      }
    });

    // Test endpoints
    this.app.post('/api/test/message', async (req: Request, res: Response) => {
      try {
        const { thread_id, text } = req.body;
        await this.adminInterface.sendTestMessage(thread_id, text);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/test/backend', async (req: Request, res: Response) => {
      try {
        const result = await this.adminInterface.testBackendConnection();
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Serve static frontend in production
    const frontendPath = path.join(process.cwd(), 'admin-portal/client/build');
    if (fs.existsSync(frontendPath)) {
      this.app.use(express.static(frontendPath));
      // Fallback to index.html for SPA routing (must be last)
      this.app.use((req: Request, res: Response) => {
        res.sendFile(path.join(frontendPath, 'index.html'));
      });
    }
  }

  private setupWebSocket(): void {
    if (!this.server) return;

    this.wss = new WebSocketServer({ server: this.server, path: '/ws/logs' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      // Auth check
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (token !== this.authToken) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      console.log('Log client connected');
      this.logClients.add(ws);

      ws.on('close', () => {
        console.log('Log client disconnected');
        this.logClients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.logClients.delete(ws);
      });
    });

    // Start log tailing
    this.startLogTailing();
  }

  private startLogTailing(): void {
    const logPath = this.config.logging?.file || './edge-agent.log';

    if (!fs.existsSync(logPath)) {
      console.warn(`Log file not found: ${logPath}`);
      return;
    }

    try {
      this.logTail = new Tail(logPath, {
        follow: true,
        useWatchFile: true,
      });

      this.logTail.on('line', (line: string) => {
        this.broadcastLog(line);
      });

      this.logTail.on('error', (error: Error) => {
        console.error('Log tail error:', error);
      });

      console.log(`Tailing logs from: ${logPath}`);
    } catch (error) {
      console.error('Failed to start log tailing:', error);
    }
  }

  private broadcastLog(line: string): void {
    const message = JSON.stringify({ type: 'log', data: line });
    this.logClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, '127.0.0.1', () => {
        console.log(`Admin portal running at http://127.0.0.1:${this.port}`);
        console.log(`Auth token: ${this.authToken}`);
        this.setupWebSocket();
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.logTail) {
      this.logTail.unwatch();
    }

    if (this.wss) {
      this.wss.close();
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log('Admin portal stopped');
          resolve();
        });
      });
    }
  }

  public getAuthToken(): string {
    return this.authToken;
  }
}
