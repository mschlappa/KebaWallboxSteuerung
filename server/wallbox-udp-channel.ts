/**
 * Wallbox UDP Channel
 * 
 * Zentrale UDP-Kommunikationsschicht für Port 7090.
 * Besitzt den einzigen Socket und routet Nachrichten an die richtigen Consumer.
 * 
 * Event-Typen:
 * - 'command': KEBA-Befehle wie "report 1", "report 2", "report 3"
 * - 'broadcast': JSON-Broadcasts wie {"Input": 1}, {"E pres": 1234}
 */

import dgram from 'dgram';
import type { Socket, RemoteInfo } from 'dgram';
import { EventEmitter } from 'events';
import { log } from './logger';

const WALLBOX_UDP_PORT = 7090;

type CommandHandler = (command: string, rinfo: RemoteInfo) => void;
type BroadcastHandler = (data: any, rinfo: RemoteInfo) => void;

class WallboxUdpChannel extends EventEmitter {
  private socket: Socket | null = null;
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      log("debug", "system", "[UDP-Channel] Läuft bereits");
      return;
    }

    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        log("error", "system", "[UDP-Channel] Socket Error:", err.message);
      });

      this.socket.on('message', (msg, rinfo) => {
        const message = msg.toString().trim();
        
        // Unterscheide zwischen Befehlen und Broadcasts
        if (message.startsWith('{')) {
          // JSON-Broadcast
          try {
            const data = JSON.parse(message);
            this.emit('broadcast', data, rinfo);
          } catch (err) {
            log("debug", "system", "[UDP-Channel] JSON-Parse-Fehler:", message);
          }
        } else {
          // KEBA-Befehl (z.B. "report 1")
          this.emit('command', message, rinfo);
        }
      });

      // Bind auf Port 7090
      await new Promise<void>((resolve, reject) => {
        this.socket!.once('error', reject);
        this.socket!.bind(WALLBOX_UDP_PORT, () => {
          this.socket!.removeListener('error', reject);
          resolve();
        });
      });

      this.isRunning = true;
      log("info", "system", "✅ [UDP-Channel] Wallbox UDP-Kanal läuft auf Port 7090");
    } catch (error) {
      log("error", "system", "[UDP-Channel] Start fehlgeschlagen:", error instanceof Error ? error.message : String(error));
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.socket) {
      return;
    }

    return new Promise<void>((resolve) => {
      this.socket!.close(() => {
        log("info", "system", "✅ [UDP-Channel] Wallbox UDP-Kanal gestoppt");
        this.socket = null;
        this.isRunning = false;
        this.removeAllListeners();
        resolve();
      });
    });
  }

  sendCommandResponse(data: any, address: string, port: number): void {
    if (!this.socket) {
      log("error", "system", "[UDP-Channel] Socket nicht verfügbar");
      return;
    }

    const response = JSON.stringify(data);
    const buffer = Buffer.from(response);

    this.socket.send(buffer, 0, buffer.length, port, address, (err) => {
      if (err) {
        log("error", "system", "[UDP-Channel] Senden fehlgeschlagen:", err.message);
      }
    });
  }

  sendBroadcast(data: any): void {
    if (!this.socket) {
      log("error", "system", "[UDP-Channel] Socket nicht verfügbar");
      return;
    }

    const broadcast = JSON.stringify(data);
    const buffer = Buffer.from(broadcast);

    // Broadcast an 255.255.255.255:7090
    this.socket.setBroadcast(true);
    this.socket.send(buffer, 0, buffer.length, WALLBOX_UDP_PORT, '255.255.255.255', (err) => {
      if (err) {
        log("error", "system", "[UDP-Channel] Broadcast fehlgeschlagen:", err.message);
      }
    });

    // Emittiere 'broadcast'-Event auch lokal (Socket empfängt eigenen Broadcast nicht)
    this.emit('broadcast', data, { address: '127.0.0.1', port: WALLBOX_UDP_PORT, family: 'IPv4', size: buffer.length });
  }

  onCommand(handler: CommandHandler): void {
    this.on('command', handler);
  }

  onBroadcast(handler: BroadcastHandler): void {
    this.on('broadcast', handler);
  }

  offCommand(handler: CommandHandler): void {
    this.off('command', handler);
  }

  offBroadcast(handler: BroadcastHandler): void {
    this.off('broadcast', handler);
  }
}

// Singleton-Instanz
export const wallboxUdpChannel = new WallboxUdpChannel();
