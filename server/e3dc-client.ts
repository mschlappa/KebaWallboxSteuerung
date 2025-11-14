import { exec } from 'child_process';
import { promisify } from 'util';
import type { E3dcConfig } from '@shared/schema';
import { log } from './logger';
import { storage } from './storage';
import path from 'path';

const execAsync = promisify(exec);

class E3dcClient {
  private config: E3dcConfig | null = null;
  private lastCommandTime: number = 0;
  private readonly RATE_LIMIT_MS = 5000; // 5 Sekunden zwischen Befehlen

  configure(config: E3dcConfig): void {
    if (!config.enabled) {
      throw new Error('E3DC not enabled');
    }
    this.config = config;
  }

  disconnect(): void {
    this.config = null;
  }

  private sanitizeOutput(value: string, command: string, extraSecrets: string[]): string {
    let sanitized = value;

    // E3DC-spezifische Patterns für Debug-Ausgaben
    const e3dcPatterns = [
      /e3dc_user=\S+/gi,
      /e3dc_password=\S+/gi,
      /aes_password=\S+/gi,
    ];

    e3dcPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, (match) => {
        const key = match.split('=')[0];
        return `${key}=xxx`;
      });
    });

    // Generische sensitive Patterns
    const sensitivePatterns = [
      /--password[=\s]+\S+/gi,
      /--pass[=\s]+\S+/gi,
      /--token[=\s]+\S+/gi,
      /--auth[=\s]+\S+/gi,
      /--apikey[=\s]+\S+/gi,
      /--api-key[=\s]+\S+/gi,
      /--secret[=\s]+\S+/gi,
      /-p[=\s]+\S+/gi,
      /\b(password|pass|token|auth|apikey|api-key|secret|key)[=:]\S+/gi,
    ];

    sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    extraSecrets.forEach(secret => {
      if (secret && secret.trim() !== '') {
        sanitized = sanitized.replace(new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '***');
      }
    });

    return sanitized;
  }

  private getSensitiveValues(): string[] {
    if (!this.config) return [];
    
    const values: string[] = [];
    
    if (this.config.dischargeLockEnableCommand) {
      values.push(this.config.dischargeLockEnableCommand);
    }
    if (this.config.dischargeLockDisableCommand) {
      values.push(this.config.dischargeLockDisableCommand);
    }
    if (this.config.gridChargeEnableCommand) {
      values.push(this.config.gridChargeEnableCommand);
    }
    if (this.config.gridChargeDisableCommand) {
      values.push(this.config.gridChargeDisableCommand);
    }
    
    return values;
  }

  /**
   * Führt Mock-E3DC-Befehl aus (Demo-Modus)
   * Ruft e3dcset-mock.ts auf statt echtem CLI-Tool
   */
  private async executeMockCommand(mockCommand: string, commandName: string): Promise<void> {
    const mockScriptPath = path.join(process.cwd(), 'server', 'e3dcset-mock.ts');
    const fullCommand = `tsx ${mockScriptPath} ${mockCommand}`;
    
    try {
      log('info', 'system', `E3DC Mock: ${commandName}`, `Befehl: ${mockCommand}`);
      
      const { stdout, stderr } = await execAsync(fullCommand);
      
      if (stdout) {
        log('info', 'system', `E3DC Mock: ${commandName} - Ausgabe`, stdout.trim());
      }
      
      if (stderr) {
        log('warning', 'system', `E3DC Mock: ${commandName} - Fehler-Ausgabe`, stderr.trim());
      }
      
      log('info', 'system', `E3DC Mock: ${commandName} erfolgreich ausgeführt`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', 'system', `E3DC Mock: ${commandName} fehlgeschlagen`, errorMessage);
      throw new Error(`Failed to execute ${commandName} (Mock)`);
    }
  }

  private async executeCommand(command: string | undefined, commandName: string): Promise<void> {
    if (!command || command.trim() === '') {
      log('info', 'system', `E3DC: ${commandName} - Kein Befehl konfiguriert, überspringe`);
      return;
    }

    // Im Demo-Modus: Mock-Script verwenden statt echtes CLI
    const settings = storage.getSettings();
    if (settings?.demoMode) {
      // Parse e3dcset-Befehle und konvertiere zu Mock-Format
      // Beispiel: "e3dcset -s discharge 0" → "-s discharge 0"
      const mockCommand = command.replace(/^e3dcset\s+/, '');
      return this.executeMockCommand(mockCommand, commandName);
    }

    // Production-Modus: Echtes CLI verwenden
    // Kombiniere Prefix + Parameter mit Leerzeichen
    const prefix = this.config?.prefix?.trim() || '';
    const fullCommand = prefix 
      ? `${prefix} ${command}`.trim() 
      : command;

    // Rate Limiting: Warten wenn letzter Befehl weniger als 5 Sekunden her ist
    const now = Date.now();
    const timeSinceLastCommand = now - this.lastCommandTime;
    
    if (this.lastCommandTime > 0 && timeSinceLastCommand < this.RATE_LIMIT_MS) {
      const waitTime = this.RATE_LIMIT_MS - timeSinceLastCommand;
      log('info', 'system', `E3DC: Rate Limiting - Warte ${(waitTime / 1000).toFixed(1)}s vor nächstem Befehl`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    const sensitiveValues = this.getSensitiveValues();

    try {
      // Command ohne Sanitization loggen (Credentials sind in externer Datei)
      log('info', 'system', `E3DC: ${commandName}`, `Befehl: ${fullCommand}`);
      
      const { stdout, stderr } = await execAsync(fullCommand);
      
      if (stdout) {
        const sanitized = this.sanitizeOutput(stdout, command, sensitiveValues);
        log('info', 'system', `E3DC: ${commandName} - Ausgabe`, sanitized);
      }
      
      if (stderr) {
        const sanitized = this.sanitizeOutput(stderr, command, sensitiveValues);
        log('warning', 'system', `E3DC: ${commandName} - Fehler-Ausgabe`, sanitized);
      }
      
      // Zeitpunkt des letzten Befehls aktualisieren
      this.lastCommandTime = Date.now();
      log('info', 'system', `E3DC: ${commandName} erfolgreich ausgeführt`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      log('error', 'system', `E3DC: ${commandName} fehlgeschlagen`, `Command failed: ${fullCommand} ${errorMessage}`);
      throw new Error(`Failed to execute ${commandName}`);
    }
  }

  async lockDischarge(): Promise<void> {
    if (!this.config) {
      throw new Error('E3DC not configured');
    }
    await this.executeCommand(this.config.dischargeLockEnableCommand, 'Entladesperre aktivieren');
  }

  async unlockDischarge(): Promise<void> {
    if (!this.config) {
      throw new Error('E3DC not configured');
    }
    await this.executeCommand(this.config.dischargeLockDisableCommand, 'Entladesperre deaktivieren');
  }

  async enableGridCharge(): Promise<void> {
    if (!this.config) {
      throw new Error('E3DC not configured');
    }
    await this.executeCommand(this.config.gridChargeEnableCommand, 'Netzstrom-Laden aktivieren');
  }

  async disableGridCharge(): Promise<void> {
    if (!this.config) {
      throw new Error('E3DC not configured');
    }
    await this.executeCommand(this.config.gridChargeDisableCommand, 'Netzstrom-Laden deaktivieren');
  }

  isConfigured(): boolean {
    return this.config !== null && this.config.enabled === true;
  }

  isGridChargeDuringNightChargingEnabled(): boolean {
    return this.config?.gridChargeDuringNightCharging === true;
  }
}

export const e3dcClient = new E3dcClient();
