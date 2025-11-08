import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createSocket, type Socket } from "dgram";
import { settingsSchema, controlStateSchema, logSettingsSchema, type LogLevel } from "@shared/schema";

const UDP_PORT = 7090;
const UDP_TIMEOUT = 6000;

// Globaler Socket für Wallbox-Kommunikation
let wallboxSocket: Socket | null = null;
let currentRequest: { command: string, resolve: (data: any) => void, reject: (error: Error) => void, timeout: NodeJS.Timeout } | null = null;
let commandQueue: Array<{ ip: string, command: string, resolve: (data: any) => void, reject: (error: Error) => void }> = [];

const logLevelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
};

function log(level: LogLevel, category: "wallbox" | "webhook" | "system", message: string, details?: string): void {
  const currentSettings = storage.getLogSettings();
  const currentLevelPriority = logLevelPriority[currentSettings.level];
  const messageLevelPriority = logLevelPriority[level];
  
  if (messageLevelPriority >= currentLevelPriority) {
    storage.addLog({ level, category, message, details });
    console.log(`[${level.toUpperCase()}] [${category}] ${message}${details ? ` - ${details}` : ""}`);
  }
}

function parseKebaResponse(response: string): Record<string, any> {
  const trimmed = response.trim();
  
  // Spezialfall: TCH-OK :done Antwort
  if (trimmed.includes("TCH-OK")) {
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      return { [key]: value };
    }
    return { "TCH-OK": "done" };
  }
  
  // KEBA Wallbox sendet JSON-Format - versuche zuerst JSON zu parsen
  try {
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return JSON.parse(trimmed);
    }
  } catch (error) {
    // Kein gültiges JSON - versuche Key=Value Format
  }
  
  // Fallback: Parse Key=Value Format (für ältere Wallbox-Modelle)
  const result: Record<string, any> = {};
  const lines = response.split(/[\n]/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const header = trimmed.substring(0, colonIndex).trim();
      const content = trimmed.substring(colonIndex + 1).trim();
      
      const pairs = content.split(';');
      for (const pair of pairs) {
        const pairTrimmed = pair.trim();
        if (!pairTrimmed) continue;
        
        const equalIndex = pairTrimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = pairTrimmed.substring(0, equalIndex).trim();
          const value = pairTrimmed.substring(equalIndex + 1).trim();
          const numValue = parseFloat(value);
          result[key] = isNaN(numValue) ? value : numValue;
        }
      }
      continue;
    }
    
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();
      const numValue = parseFloat(value);
      result[key] = isNaN(numValue) ? value : numValue;
    }
  }
  
  return result;
}

function isValidReportResponse(command: string, parsed: Record<string, any>): boolean {
  // Prüfe ob die Antwort zum erwarteten Report passt
  if (command === "report 1") {
    // Report 1 muss ID=1 und Product/Serial/Firmware enthalten
    return parsed.ID === "1" && (parsed.Product || parsed.Serial || parsed.Firmware);
  }
  
  if (command === "report 2") {
    // Report 2 muss ID=2 und State/Plug/"Max curr" enthalten
    return parsed.ID === "2" && (parsed.State !== undefined || parsed.Plug !== undefined || parsed["Max curr"] !== undefined);
  }
  
  if (command === "report 3") {
    // Report 3 muss ID=3 und U1/I1/P enthalten
    return parsed.ID === "3" && (parsed.U1 !== undefined || parsed.I1 !== undefined || parsed.P !== undefined);
  }
  
  // Für ena/curr Befehle: Akzeptiere nur TCH-OK :done
  if (command.startsWith("ena") || command.startsWith("curr")) {
    const responseStr = JSON.stringify(parsed);
    return responseStr.includes("TCH-OK") || parsed["TCH-OK"] !== undefined;
  }
  
  // Für andere Befehle akzeptieren wir jede Antwort
  return true;
}

function initWallboxSocket(): void {
  if (wallboxSocket) return;
  
  wallboxSocket = createSocket({ type: "udp4", reuseAddr: true });
  
  wallboxSocket.on("message", (msg) => {
    const response = msg.toString();
    
    if (currentRequest) {
      try {
        log("debug", "wallbox", `UDP-Roh-Antwort empfangen für "${currentRequest.command}"`, `Rohdaten: ${response.substring(0, 200)}`);
        const parsed = parseKebaResponse(response);
        
        // Validiere ob die Antwort zum erwarteten Befehl passt
        if (!isValidReportResponse(currentRequest.command, parsed)) {
          log("debug", "wallbox", `Antwort ignoriert (passt nicht zu "${currentRequest.command}")`, `Daten: ${JSON.stringify(parsed).substring(0, 100)}`);
          // Nicht den Timeout clearen - wir warten weiter auf die richtige Antwort
          return;
        }
        
        log("debug", "wallbox", `UDP-Antwort geparst für "${currentRequest.command}"`, `Daten: ${JSON.stringify(parsed).substring(0, 200)}`);
        clearTimeout(currentRequest.timeout);
        const resolve = currentRequest.resolve;
        currentRequest = null;
        resolve(parsed);
        // Kürzere Pause zwischen erfolgreichen Befehlen (100ms reicht jetzt)
        setTimeout(() => processCommandQueue(), 100);
      } catch (error) {
        log("error", "wallbox", "Fehler beim Parsen der UDP-Antwort", error instanceof Error ? error.message : String(error));
        if (currentRequest) {
          clearTimeout(currentRequest.timeout);
          const reject = currentRequest.reject;
          currentRequest = null;
          reject(new Error("Failed to parse UDP response"));
          setTimeout(() => processCommandQueue(), 100);
        }
      }
    } else {
      // Wallbox sendet automatische Broadcasts während des Ladens - nur im Debug-Modus loggen
      log("debug", "wallbox", "Broadcast empfangen", `Daten: ${response.substring(0, 100)}`);
    }
  });

  wallboxSocket.on("error", (error) => {
    log("error", "wallbox", "UDP-Socket-Fehler", error instanceof Error ? error.message : String(error));
  });

  wallboxSocket.bind(UDP_PORT, () => {
    log("info", "system", `Wallbox-Socket lauscht auf Port ${UDP_PORT}`, ``);
  });
}

function processCommandQueue(): void {
  if (currentRequest || commandQueue.length === 0) {
    return;
  }
  
  const nextCommand = commandQueue.shift();
  if (!nextCommand) return;
  
  const { ip, command, resolve, reject } = nextCommand;
  const startTime = Date.now();
  
  log("debug", "wallbox", `Sende UDP-Befehl an ${ip}`, `Befehl: ${command}`);
  
  const timeout = setTimeout(() => {
    const duration = Date.now() - startTime;
    log("error", "wallbox", `UDP-Timeout nach ${duration}ms`, `IP: ${ip}, Befehl: ${command}`);
    currentRequest = null;
    reject(new Error("UDP request timeout"));
    // Pause vor dem nächsten Befehl nach einem Timeout
    setTimeout(() => processCommandQueue(), 100);
  }, UDP_TIMEOUT);

  currentRequest = { command, resolve, reject, timeout };

  if (wallboxSocket) {
    // KEBA erwartet Befehle mit Zeilenumbruch
    const commandWithNewline = command + "\n";
    wallboxSocket.send(commandWithNewline, UDP_PORT, ip, (error) => {
      if (error) {
        clearTimeout(timeout);
        log("error", "wallbox", "Fehler beim Senden des UDP-Befehls", error instanceof Error ? error.message : String(error));
        currentRequest = null;
        reject(error);
        setTimeout(() => processCommandQueue(), 100);
      }
    });
  } else {
    clearTimeout(timeout);
    currentRequest = null;
    reject(new Error("Wallbox socket not initialized"));
    setTimeout(() => processCommandQueue(), 100);
  }
}

async function sendUdpCommand(ip: string, command: string): Promise<any> {
  initWallboxSocket();
  
  return new Promise((resolve, reject) => {
    commandQueue.push({ ip, command, resolve, reject });
    processCommandQueue();
  });
}

async function sendUdpCommandNoResponse(ip: string, command: string): Promise<void> {
  initWallboxSocket();
  
  return new Promise((resolve, reject) => {
    if (!wallboxSocket) {
      reject(new Error("Wallbox socket not initialized"));
      return;
    }
    
    log("debug", "wallbox", `Sende Fire-and-Forget UDP-Befehl an ${ip}`, `Befehl: ${command}`);
    const commandWithNewline = command + "\n";
    
    wallboxSocket.send(commandWithNewline, UDP_PORT, ip, (error) => {
      if (error) {
        log("error", "wallbox", "Fehler beim Senden des UDP-Befehls", error instanceof Error ? error.message : String(error));
        reject(error);
      } else {
        log("debug", "wallbox", `Fire-and-Forget Befehl gesendet`, `Befehl: ${command}`);
        resolve();
      }
    });
  });
}

async function callSmartHomeUrl(url: string | undefined): Promise<void> {
  if (!url) return;
  try {
    log("info", "webhook", `Rufe SmartHome-URL auf`, `URL: ${url}`);
    const response = await fetch(url, { method: "GET" });
    log("info", "webhook", `SmartHome-URL erfolgreich aufgerufen`, `Status: ${response.status}, URL: ${url}`);
  } catch (error) {
    log("error", "webhook", "Fehler beim Aufruf der SmartHome-URL", `URL: ${url}, Fehler: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getFhemDeviceState(baseUrl: string, deviceName: string): Promise<boolean | null> {
  try {
    const url = `${baseUrl}?detail=${deviceName}`;
    log("debug", "webhook", `Frage FHEM-Gerätestatus ab`, `URL: ${url}, Gerät: ${deviceName}`);
    
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      log("warning", "webhook", `FHEM-Statusabfrage fehlgeschlagen`, `Status: ${response.status}, URL: ${url}`);
      return null;
    }
    
    const html = await response.text();
    
    // Suche nach <div informId="deviceName-state">on/off</div>
    const regex = new RegExp(`<div informId="${deviceName}-state">([^<]*)`, 'i');
    const match = html.match(regex);
    
    if (match && match[1]) {
      const state = match[1].trim().toLowerCase();
      log("debug", "webhook", `FHEM-Gerätestatus empfangen`, `Gerät: ${deviceName}, Status: ${state}`);
      return state === "on";
    }
    
    log("warning", "webhook", `FHEM-Status nicht gefunden im HTML`, `Gerät: ${deviceName}`);
    return null;
  } catch (error) {
    log("error", "webhook", "Fehler beim Abrufen des FHEM-Status", `Gerät: ${deviceName}, Fehler: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function extractDeviceNameFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    // Versuche zuerst detail= Parameter
    let match = url.match(/detail=([^&]+)/);
    if (match && match[1]) {
      return match[1];
    }
    
    // Fallback: Versuche cmd.DEVICE= Format
    match = url.match(/cmd\.([^=]+)=/);
    if (match && match[1]) {
      return match[1];
    }
    
    // Fallback: Versuche set%20DEVICE%20 Format (URL-encoded)
    match = url.match(/set%20([^%]+)%20/);
    if (match && match[1]) {
      return match[1];
    }
    
    // Fallback: Versuche set DEVICE Format (decoded)
    match = url.match(/set\s+(\S+)\s+/);
    if (match && match[1]) {
      return match[1];
    }
    
    return null;
  } catch {
    return null;
  }
}

function extractBaseUrlFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const match = url.match(/^(https?:\/\/[^?]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/wallbox/status", async (req, res) => {
    try {
      const settings = storage.getSettings();
      if (!settings?.wallboxIp) {
        return res.status(400).json({ error: "Wallbox IP not configured" });
      }

      const report1 = await sendUdpCommand(settings.wallboxIp, "report 1");
      const report2 = await sendUdpCommand(settings.wallboxIp, "report 2");
      const report3 = await sendUdpCommand(settings.wallboxIp, "report 3");

      const status = {
        state: report2?.State || 0,
        plug: report2?.Plug || 0,
        enableSys: report2["Enable sys"] || 0,
        maxCurr: (report2["Max curr"] || 0) / 1000,
        ePres: (report3["E pres"] || 0) / 10,
        eTotal: (report3["E total"] || 0) / 10,
        power: (report3?.P || 0) / 1000000,
        phases: report3?.["U1"] && report3?.["U2"] && report3?.["U3"] ? 3 : 
                report3?.["U1"] ? 1 : 0,
      };

      res.json(status);
    } catch (error) {
      console.error("Failed to get wallbox status:", error);
      res.status(500).json({ error: "Failed to communicate with wallbox" });
    }
  });

  app.post("/api/wallbox/start", async (req, res) => {
    try {
      const settings = storage.getSettings();
      if (!settings?.wallboxIp) {
        return res.status(400).json({ error: "Wallbox IP not configured" });
      }

      const response = await sendUdpCommand(settings.wallboxIp, "ena 1");
      
      if (!response || (!response["TCH-OK"] && !JSON.stringify(response).includes("TCH-OK"))) {
        log("error", "wallbox", `Laden starten fehlgeschlagen - keine Bestätigung`, `Antwort: ${JSON.stringify(response)}`);
        return res.status(500).json({ error: "Wallbox did not acknowledge start command" });
      }
      
      log("info", "wallbox", `Laden erfolgreich gestartet`);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to start charging:", error);
      res.status(500).json({ error: "Failed to start charging" });
    }
  });

  app.post("/api/wallbox/stop", async (req, res) => {
    try {
      const settings = storage.getSettings();
      if (!settings?.wallboxIp) {
        return res.status(400).json({ error: "Wallbox IP not configured" });
      }

      const response = await sendUdpCommand(settings.wallboxIp, "ena 0");
      
      if (!response || (!response["TCH-OK"] && !JSON.stringify(response).includes("TCH-OK"))) {
        log("error", "wallbox", `Laden stoppen fehlgeschlagen - keine Bestätigung`, `Antwort: ${JSON.stringify(response)}`);
        return res.status(500).json({ error: "Wallbox did not acknowledge stop command" });
      }
      
      log("info", "wallbox", `Laden erfolgreich gestoppt`);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to stop charging:", error);
      res.status(500).json({ error: "Failed to stop charging" });
    }
  });

  app.post("/api/wallbox/current", async (req, res) => {
    try {
      const settings = storage.getSettings();
      if (!settings?.wallboxIp) {
        return res.status(400).json({ error: "Wallbox IP not configured" });
      }

      const { current } = req.body;
      if (typeof current !== "number" || current < 6 || current > 32) {
        return res.status(400).json({ error: "Current must be between 6 and 32 amperes" });
      }

      const currentInMilliamps = Math.round(current * 1000);
      
      // Sende curr Befehl und warte auf TCH-OK :done Bestätigung
      const response = await sendUdpCommand(settings.wallboxIp, `curr ${currentInMilliamps}`);
      
      // Prüfe ob die Wallbox den Befehl bestätigt hat
      if (!response || (!response["TCH-OK"] && !JSON.stringify(response).includes("TCH-OK"))) {
        log("error", "wallbox", `Ladestrom-Änderung fehlgeschlagen - keine Bestätigung`, `Antwort: ${JSON.stringify(response)}`);
        return res.status(500).json({ error: "Wallbox did not acknowledge current change" });
      }
      
      // Verifiziere die Änderung durch Abfrage von Report 2
      await new Promise(resolve => setTimeout(resolve, 200)); // Kurze Pause für Wallbox-Verarbeitung
      const report2 = await sendUdpCommand(settings.wallboxIp, "report 2");
      const actualCurrent = report2?.["Curr user"] || 0;
      
      if (Math.abs(actualCurrent - currentInMilliamps) > 100) {
        log("error", "wallbox", `Ladestrom-Änderung fehlgeschlagen - Verifizierung`, `Erwartet: ${currentInMilliamps}mA, Tatsächlich: ${actualCurrent}mA`);
        return res.status(500).json({ error: "Current change was not applied by wallbox" });
      }
      
      log("info", "wallbox", `Ladestrom erfolgreich geändert und verifiziert`, `Neuer Wert: ${current}A (${currentInMilliamps}mA)`);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to set current:", error);
      res.status(500).json({ error: "Failed to set charging current" });
    }
  });

  app.get("/api/settings", (req, res) => {
    const settings = storage.getSettings();
    if (!settings) {
      return res.json({
        wallboxIp: "",
        pvSurplusOnUrl: "",
        pvSurplusOffUrl: "",
        nightChargingOnUrl: "",
        nightChargingOffUrl: "",
        batteryLockOnUrl: "",
        batteryLockOffUrl: "",
      });
    }
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    try {
      const settings = settingsSchema.parse(req.body);
      storage.saveSettings(settings);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Invalid settings data" });
    }
  });

  app.get("/api/controls", (req, res) => {
    const state = storage.getControlState();
    res.json(state);
  });

  app.post("/api/controls", async (req, res) => {
    try {
      const state = controlStateSchema.parse(req.body);
      const previousState = storage.getControlState();
      const settings = storage.getSettings();

      if (state.pvSurplus !== previousState.pvSurplus) {
        log("info", "system", `PV-Überschussladung ${state.pvSurplus ? "aktiviert" : "deaktiviert"}`);
        await callSmartHomeUrl(
          state.pvSurplus ? settings?.pvSurplusOnUrl : settings?.pvSurplusOffUrl
        );
      }

      if (state.nightCharging !== previousState.nightCharging) {
        log("info", "system", `Nachtladung ${state.nightCharging ? "aktiviert" : "deaktiviert"}`);
        await callSmartHomeUrl(
          state.nightCharging ? settings?.nightChargingOnUrl : settings?.nightChargingOffUrl
        );
      }

      if (state.batteryLock !== previousState.batteryLock) {
        log("info", "system", `Batterie entladen sperren ${state.batteryLock ? "aktiviert" : "deaktiviert"}`);
        await callSmartHomeUrl(
          state.batteryLock ? settings?.batteryLockOnUrl : settings?.batteryLockOffUrl
        );
      }

      storage.saveControlState(state);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Invalid control state data" });
    }
  });

  app.post("/api/controls/sync", async (req, res) => {
    try {
      const settings = storage.getSettings();
      const currentState = storage.getControlState();
      
      // Prüfe ob URLs konfiguriert sind
      if (!settings?.pvSurplusOnUrl && !settings?.nightChargingOnUrl && !settings?.batteryLockOnUrl) {
        log("warning", "system", "Keine SmartHome-URLs konfiguriert - Status-Synchronisation übersprungen");
        return res.json(currentState);
      }
      
      // Extrahiere Gerätenamen und Basis-URLs aus den konfigurierten URLs
      const pvDeviceName = extractDeviceNameFromUrl(settings?.pvSurplusOnUrl);
      const pvBaseUrl = extractBaseUrlFromUrl(settings?.pvSurplusOnUrl);
      
      const nightDeviceName = extractDeviceNameFromUrl(settings?.nightChargingOnUrl);
      const nightBaseUrl = extractBaseUrlFromUrl(settings?.nightChargingOnUrl);
      
      const batteryDeviceName = extractDeviceNameFromUrl(settings?.batteryLockOnUrl);
      const batteryBaseUrl = extractBaseUrlFromUrl(settings?.batteryLockOnUrl);
      
      // Warne wenn Gerätename oder Basis-URL nicht extrahiert werden konnte
      if (settings?.pvSurplusOnUrl && (!pvDeviceName || !pvBaseUrl)) {
        log("warning", "system", "PV-Überschuss URL konnte nicht geparst werden", `URL: ${settings.pvSurplusOnUrl}`);
      }
      if (settings?.nightChargingOnUrl && (!nightDeviceName || !nightBaseUrl)) {
        log("warning", "system", "Nachtladung URL konnte nicht geparst werden", `URL: ${settings.nightChargingOnUrl}`);
      }
      if (settings?.batteryLockOnUrl && (!batteryDeviceName || !batteryBaseUrl)) {
        log("warning", "system", "Batteriesperrung URL konnte nicht geparst werden", `URL: ${settings.batteryLockOnUrl}`);
      }
      
      // Frage externe Status ab (parallel für bessere Performance)
      const [pvState, nightState, batteryState] = await Promise.all([
        pvDeviceName && pvBaseUrl ? getFhemDeviceState(pvBaseUrl, pvDeviceName) : Promise.resolve(null),
        nightDeviceName && nightBaseUrl ? getFhemDeviceState(nightBaseUrl, nightDeviceName) : Promise.resolve(null),
        batteryDeviceName && batteryBaseUrl ? getFhemDeviceState(batteryBaseUrl, batteryDeviceName) : Promise.resolve(null),
      ]);
      
      // Aktualisiere ControlState nur wenn externe Status erfolgreich abgefragt wurden
      const newState = { ...currentState };
      let hasChanges = false;
      
      if (pvState !== null && pvState !== currentState.pvSurplus) {
        newState.pvSurplus = pvState;
        hasChanges = true;
        log("info", "system", `PV-Überschussladung extern geändert auf ${pvState ? "ein" : "aus"}`);
      }
      
      if (nightState !== null && nightState !== currentState.nightCharging) {
        newState.nightCharging = nightState;
        hasChanges = true;
        log("info", "system", `Nachtladung extern geändert auf ${nightState ? "ein" : "aus"}`);
      }
      
      if (batteryState !== null && batteryState !== currentState.batteryLock) {
        newState.batteryLock = batteryState;
        hasChanges = true;
        log("info", "system", `Batterie entladen sperren extern geändert auf ${batteryState ? "ein" : "aus"}`);
      }
      
      if (hasChanges) {
        storage.saveControlState(newState);
      }
      
      res.json(newState);
    } catch (error) {
      log("error", "system", "Fehler bei Status-Synchronisation", error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to sync control state" });
    }
  });

  app.get("/api/logs", (req, res) => {
    const logs = storage.getLogs();
    res.json(logs);
  });

  app.delete("/api/logs", (req, res) => {
    storage.clearLogs();
    log("info", "system", "Logs gelöscht");
    res.json({ success: true });
  });

  app.get("/api/logs/settings", (req, res) => {
    const settings = storage.getLogSettings();
    res.json(settings);
  });

  app.post("/api/logs/settings", (req, res) => {
    try {
      const settings = logSettingsSchema.parse(req.body);
      storage.saveLogSettings(settings);
      log("info", "system", `Log-Level auf "${settings.level}" gesetzt`);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Invalid log settings data" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
