import { execFileSync } from 'child_process';
import { ILogger } from '../interfaces/ILogger';
import { deriveKeyFromSecret, generateSecret } from './crypto';

export class KeychainManager {
  constructor(
    private readonly service: string,
    private readonly account: string,
    private readonly logger?: ILogger
  ) {}

  ensureKey(): Buffer {
    const existing = this.getSecret();
    if (existing) {
      return deriveKeyFromSecret(existing);
    }

    const secret = generateSecret();
    this.saveSecret(secret);
    return deriveKeyFromSecret(secret);
  }

  private getSecret(): string | null {
    // Allow overriding via environment (useful for CI or troubleshooting)
    const envVar = process.env.EDGE_STATE_SECRET;
    if (envVar && envVar.length > 0) {
      return envVar;
    }

    try {
      const output = execFileSync(
        'security',
        [
          'find-generic-password',
          '-s',
          this.service,
          '-a',
          this.account,
          '-w'
        ],
        { encoding: 'utf8' }
      ).trim();

      return output.length > 0 ? output : null;
    } catch (error: any) {
      // security exits with error code when the item is missing
      this.logger?.debug?.(
        `Keychain lookup for service=${this.service}, account=${this.account} returned no key (${error.message})`
      );
      return null;
    }
  }

  private saveSecret(secret: string): void {
    try {
      execFileSync(
        'security',
        [
          'add-generic-password',
          '-U',
          '-s',
          this.service,
          '-a',
          this.account,
          '-w',
          secret
        ],
        { stdio: 'ignore' }
      );
      this.logger?.info?.('Stored new edge-state encryption key in Keychain');
    } catch (error: any) {
      this.logger?.warn?.(
        `Failed to store key in Keychain (service=${this.service}, account=${this.account}): ${error.message}`
      );
    }
  }
}

