import type { Settings, ControlState, LogEntry, LogSettings, LogLevel } from "@shared/schema";

export interface IStorage {
  getSettings(): Settings | null;
  saveSettings(settings: Settings): void;
  getControlState(): ControlState;
  saveControlState(state: ControlState): void;
  getLogs(): LogEntry[];
  addLog(entry: Omit<LogEntry, "id" | "timestamp">): void;
  clearLogs(): void;
  getLogSettings(): LogSettings;
  saveLogSettings(settings: LogSettings): void;
}

export class MemStorage implements IStorage {
  private settings: Settings | null = {
    wallboxIp: "192.168.40.16",
    pvSurplusOnUrl: "http://192.168.40.11:8083/fhem?detail=autoWallboxPV&cmd.autoWallboxPV=set%20autoWallboxPV%20on",
    pvSurplusOffUrl: "http://192.168.40.11:8083/fhem?detail=autoWallboxPV&cmd.autoWallboxPV=set%20autoWallboxPV%20off",
    nightChargingOnUrl: "http://192.168.40.11:8083/fhem?detail=steckdoseAutoNachtladung&cmd.steckdoseAutoNachtladung=set%20steckdoseAutoNachtladung%20on",
    nightChargingOffUrl: "http://192.168.40.11:8083/fhem?detail=steckdoseAutoNachtladung&cmd.steckdoseAutoNachtladung=set%20steckdoseAutoNachtladung%20off",
    batteryLockOnUrl: "http://192.168.40.11:8083/fhem?detail=s10EntladenSperren&cmd.s10EntladenSperren=set%20s10EntladenSperren%20on",
    batteryLockOffUrl: "http://192.168.40.11:8083/fhem?detail=s10EntladenSperren&cmd.s10EntladenSperren=set%20s10EntladenSperren%20off",
  };
  private controlState: ControlState = {
    pvSurplus: false,
    nightCharging: false,
    batteryLock: false,
  };
  private logs: LogEntry[] = [];
  private logSettings: LogSettings = {
    level: "info" as LogLevel,
  };
  private maxLogs = 1000;

  constructor() {}

  getSettings(): Settings | null {
    return this.settings;
  }

  saveSettings(settings: Settings): void {
    this.settings = settings;
  }

  getControlState(): ControlState {
    return this.controlState;
  }

  saveControlState(state: ControlState): void {
    this.controlState = state;
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  addLog(entry: Omit<LogEntry, "id" | "timestamp">): void {
    const logEntry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    
    this.logs.push(logEntry);
    
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  clearLogs(): void {
    this.logs = [];
  }

  getLogSettings(): LogSettings {
    return this.logSettings;
  }

  saveLogSettings(settings: LogSettings): void {
    this.logSettings = settings;
  }
}

export const storage = new MemStorage();
