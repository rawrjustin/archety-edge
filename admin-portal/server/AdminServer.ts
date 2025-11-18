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

  constructor(adminInterface: IAdminInterface, configPath: string, port: number = 3100) {
    this.adminInterface = adminInterface;
    this.port = port;
    this.app = express();

    // Load config
    this.config = this.loadConfig(configPath);

    // Generate auth token from EDGE_SECRET or generate random
    this.authToken = process.env.ADMIN_TOKEN || process.env.EDGE_SECRET || this.generateToken();

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

  private generateToken(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }

  private setupMiddleware(): void {
    // CORS - allow localhost only
    this.app.use(cors({
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true
    }));

    this.app.use(express.json());

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
        RELAY_WEBHOOK_SECRET: process.env.RELAY_WEBHOOK_SECRET ? '***masked***' : 'not set',
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
        const logPath = this.config.logging?.file || './edge-agent.log';
        const lines = parseInt(req.query.lines as string) || 100;

        if (!fs.existsSync(logPath)) {
          return res.json([]);
        }

        const content = fs.readFileSync(logPath, 'utf8');
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
        const scriptPath = path.join(process.cwd(), 'edge-agent.sh');
        await execAsync(`${scriptPath} restart`);
        res.json({ success: true, message: 'Service restarting...' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/service/stop', async (req: Request, res: Response) => {
      try {
        const scriptPath = path.join(process.cwd(), 'edge-agent.sh');
        await execAsync(`${scriptPath} stop`);
        res.json({ success: true, message: 'Service stopped' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/service/status', async (req: Request, res: Response) => {
      try {
        const scriptPath = path.join(process.cwd(), 'edge-agent.sh');
        const { stdout } = await execAsync(`${scriptPath} status`);
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
