import type { LogLevel } from "@shared/schema";
import { storage } from "./storage";

const logLevelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
};

export function log(level: LogLevel, category: "wallbox" | "webhook" | "system", message: string, details?: string): void {
  const currentSettings = storage.getLogSettings();
  const currentLevelPriority = logLevelPriority[currentSettings.level];
  const messageLevelPriority = logLevelPriority[level];
  
  if (messageLevelPriority >= currentLevelPriority) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString('de-DE', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3 
    });
    
    storage.addLog({ level, category, message, details });
    console.log(`[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}${details ? ` - ${details}` : ""}`);
  }
}
