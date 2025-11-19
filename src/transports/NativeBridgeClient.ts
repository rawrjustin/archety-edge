import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';
import * as fs from 'fs';
import { ILogger } from '../interfaces/ILogger';

export interface BridgeAttachmentPayload {
  id: number;
  guid: string;
  filename?: string;
  uti?: string;
  mime_type?: string;
  transfer_name?: string;
  total_bytes?: number;
  created_at?: string;
  is_sticker?: boolean;
  is_outgoing?: boolean;
  relative_path?: string;
  absolute_path?: string;
}

export interface BridgeMessagePayload {
  id: number;
  thread_id: string;
  sender: string;
  text: string;
  timestamp: string;
  participants: string[];
  is_group: boolean;
  attachments: BridgeAttachmentPayload[];
}

interface BridgeEnvelope {
  type: 'message' | 'log' | 'error';
  payload: any;
}

interface NativeBridgeOptions {
  executable: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export declare interface NativeBridgeClient {
  on(event: 'message', listener: (payload: BridgeMessagePayload) => void): this;
  on(event: 'log', listener: (payload: any) => void): this;
  on(event: 'error', listener: (payload: any) => void): this;
}

export class NativeBridgeClient extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private rl?: readline.Interface;

  constructor(
    private readonly options: NativeBridgeOptions,
    private readonly logger: ILogger
  ) {
    super();
  }

  async start(): Promise<void> {
    if (!fs.existsSync(this.options.executable)) {
      throw new Error(`Native bridge executable not found at ${this.options.executable}`);
    }

    return new Promise((resolve, reject) => {
      this.child = spawn(
        this.options.executable,
        this.options.args || [],
        {
          cwd: this.options.cwd || process.cwd(),
          env: {
            ...process.env,
            ...this.options.env
          }
        }
      );

      let resolved = false;

      this.child.once('spawn', () => {
        resolved = true;
        resolve();
      });

      this.child.once('error', (error) => {
        this.logger.error(`Native bridge failed to start: ${error.message}`);
        if (!resolved) {
          reject(error);
        } else {
          this.emit('error', { message: error.message });
        }
      });

      this.child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        this.logger.warn(`[native-helper] ${text.trim()}`);
      });

      this.rl = readline.createInterface({
        input: this.child.stdout
      });

      this.rl.on('line', (line) => {
        try {
          if (!line.trim()) {
            return;
          }

          const envelope = JSON.parse(line) as BridgeEnvelope;
          switch (envelope.type) {
            case 'message':
              this.emit('message', envelope.payload as BridgeMessagePayload);
              break;
            case 'log':
              this.emit('log', envelope.payload);
              break;
            case 'error':
              this.emit('error', envelope.payload);
              break;
            default:
              this.logger.debug(`Unknown envelope type from bridge: ${envelope.type}`);
          }
        } catch (error: any) {
          this.logger.error(`Failed to parse native helper output: ${error.message}`);
        }
      });
    });
  }

  stop(): void {
    this.rl?.close();
    this.rl = undefined;

    if (this.child) {
      this.child.kill('SIGTERM');
      this.child = undefined;
    }
  }
}

