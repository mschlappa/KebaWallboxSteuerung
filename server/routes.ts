import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { settingsSchema, controlStateSchema, logSettingsSchema, type LogLevel, e3dcBatteryStatusSchema, type ControlState, e3dcLiveDataSchema, chargingStrategyConfigSchema, chargingStrategySchema } from "@shared/schema";
import { e3dcClient } from "./e3dc-client";
import { getE3dcModbusService } from "./e3dc-modbus";
import { log } from "./logger";
import { z } from "zod";
import { ChargingStrategyController } from "./charging-strategy-controller";
import { wallboxMockService } from "./wallbox-mock";
import { sendUdpCommand, sendUdpCommandNoResponse } from "./wallbox-transport";

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

      // Phasenzahl aus Strömen ableiten (nicht aus Spannungen, da diese immer anliegen)
      const i1 = report3?.["I1"] || 0;
      const i2 = report3?.["I2"] || 0;
      const i3 = report3?.["I3"] || 0;
      
      // Zähle wie viele Phasen aktiv sind (>100mA = 0.1A Threshold)
      const CURRENT_THRESHOLD = 100; // mA
      let activePhaseCount = 0;
      if (i1 > CURRENT_THRESHOLD) activePhaseCount++;
      if (i2 > CURRENT_THRESHOLD) activePhaseCount++;
      if (i3 > CURRENT_THRESHOLD) activePhaseCount++;
      
      const detectedPhases = activePhaseCount; // 0, 1, 2, or 3

      const status = {
        state: report2?.State || 0,
        plug: report2?.Plug || 0,
        input: report2?.Input, // Potenzialfreier Kontakt (optional)
        enableSys: report2["Enable sys"] || 0,
        maxCurr: (report2["Max curr"] || 0) / 1000,
        ePres: report3["E pres"] || 0,  // Energie in Wh (Frontend konvertiert zu kWh)
        eTotal: report3["E total"] || 0,  // Energie in Wh (Frontend konvertiert zu kWh)
        power: (report3?.P || 0) / 1000000,
        phases: detectedPhases,
        i1: i1 / 1000,
        i2: i2 / 1000,
        i3: i3 / 1000,
        lastUpdated: new Date().toISOString(),
      };

      // Tracke Änderungen des Kabelstatus im Hintergrund (nur bei gültigen Werten)
      if (typeof status.plug === "number") {
        const tracking = storage.getPlugStatusTracking();
        if (tracking.lastPlugStatus !== undefined && tracking.lastPlugStatus !== status.plug) {
          // Status hat sich geändert - speichere Zeitstempel
          storage.savePlugStatusTracking({
            lastPlugStatus: status.plug,
            lastPlugChange: new Date().toISOString(),
          });
          log('info', 'wallbox', `Kabelstatus geändert: ${tracking.lastPlugStatus} -> ${status.plug}`);
        } else if (tracking.lastPlugStatus === undefined) {
          // Erster Aufruf - initialisiere ohne Zeitstempel
          storage.savePlugStatusTracking({
            lastPlugStatus: status.plug,
          });
        }
      }

      res.json(status);
    } catch (error) {
      log('error', 'wallbox', 'Failed to get wallbox status', error instanceof Error ? error.message : String(error));
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
      log('error', 'wallbox', 'Failed to start charging', error instanceof Error ? error.message : String(error));
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
      log('error', 'wallbox', 'Failed to stop charging', error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to stop charging" });
    }
  });

  app.post("/api/wallbox/current", async (req, res) => {
    try {
      const settings = storage.getSettings();
      
      const { current } = req.body;
      if (typeof current !== "number" || current < 6 || current > 32) {
        return res.status(400).json({ error: "Current must be between 6 and 32 amperes" });
      }

      const currentInMilliamps = Math.round(current * 1000);
      
      if (!settings?.wallboxIp) {
        return res.status(400).json({ error: "Wallbox IP not configured" });
      }
      
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
      log('error', 'wallbox', 'Failed to set current', error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to set charging current" });
    }
  });

  app.post("/api/wallbox/demo-input", async (req, res) => {
    try {
      const settings = storage.getSettings();
      
      // Prüfe ob Demo-Modus aktiv ist
      if (!settings?.demoMode) {
        return res.status(403).json({ error: "Demo mode not enabled" });
      }
      
      // Validiere Request Body mit Zod
      const requestSchema = z.object({
        input: z.union([z.literal(0), z.literal(1)])
      });
      
      const parsed = requestSchema.parse(req.body);
      const { input } = parsed;
      
      // Setze Input in Mock-Wallbox (sendet automatisch UDP-Broadcast)
      wallboxMockService.setInput(input);
      
      log("info", "wallbox", `Demo: Potenzialfreier Kontakt (Input) gesetzt`, `Wert: ${input}`);
      res.json({ success: true, input });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: error.errors 
        });
      }
      log('error', 'wallbox', 'Failed to set demo input', error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to set demo input" });
    }
  });

  app.post("/api/wallbox/demo-plug", async (req, res) => {
    try {
      const settings = storage.getSettings();
      
      // Prüfe ob Demo-Modus aktiv ist
      if (!settings?.demoMode) {
        return res.status(403).json({ error: "Demo mode not enabled" });
      }
      
      // Validiere Request Body mit Zod
      const requestSchema = z.object({
        plug: z.number().min(0).max(7)
      });
      
      const parsed = requestSchema.parse(req.body);
      const { plug } = parsed;
      
      // Setze Plug-Status in Mock-Wallbox (sendet automatisch UDP-Broadcast)
      wallboxMockService.setPlugStatus(plug);
      
      // Aktualisiere Settings
      const updatedSettings = { ...settings, mockWallboxPlugStatus: plug };
      storage.saveSettings(updatedSettings);
      
      log("info", "wallbox", `Demo: Plug-Status gesetzt`, `Wert: ${plug}`);
      res.json({ success: true, plug });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: error.errors 
        });
      }
      log('error', 'wallbox', 'Failed to set demo plug status', error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to set demo plug status" });
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

  app.post("/api/settings", async (req, res) => {
    try {
      const newSettings = settingsSchema.parse(req.body);
      const oldSettings = storage.getSettings();
      
      // Prüfe ob Strategie sich geändert hat
      const oldStrategy = oldSettings?.chargingStrategy?.activeStrategy;
      const newStrategy = newSettings?.chargingStrategy?.activeStrategy;
      const strategyChanged = oldStrategy !== newStrategy;
      
      // Prüfe ob Mock-Wallbox-Phasen sich geändert haben
      const oldPhases = oldSettings?.mockWallboxPhases;
      const newPhases = newSettings?.mockWallboxPhases;
      const phasesChanged = oldPhases !== newPhases;
      
      // Prüfe ob Mock-Wallbox-Plug-Status sich geändert hat
      const oldPlug = oldSettings?.mockWallboxPlugStatus;
      const newPlug = newSettings?.mockWallboxPlugStatus;
      const plugChanged = oldPlug !== newPlug;
      
      storage.saveSettings(newSettings);
      
      // Demo-Modus: Aktualisiere Mock-Wallbox-Phasen ohne Neustart
      if (newSettings.demoMode && phasesChanged && newPhases) {
        try {
          wallboxMockService.setPhases(newPhases);
          log("info", "system", `Mock-Wallbox-Phasen aktualisiert: ${newPhases}P`, "Änderung sofort wirksam ohne Neustart");
        } catch (error) {
          log("warning", "system", "Mock-Wallbox-Phasen konnten nicht aktualisiert werden", error instanceof Error ? error.message : String(error));
        }
      }
      
      // Demo-Modus: Aktualisiere Mock-Wallbox-Plug-Status und sende Broadcast
      if (newSettings.demoMode && plugChanged && newPlug !== undefined) {
        try {
          wallboxMockService.setPlugStatus(newPlug);
          log("info", "system", `Mock-Wallbox-Plug-Status aktualisiert: ${newPlug}`, "Broadcast gesendet");
        } catch (error) {
          log("warning", "system", "Mock-Wallbox-Plug-Status konnte nicht aktualisiert werden", error instanceof Error ? error.message : String(error));
        }
      }
      
      // E3DC-Konfiguration speichern wenn aktiviert
      if (newSettings.e3dc?.enabled) {
        try {
          log("info", "system", "E3DC-Konfiguration wird gespeichert");
          e3dcClient.configure(newSettings.e3dc);
          log("info", "system", "E3DC-Konfiguration erfolgreich gespeichert");
        } catch (error) {
          log("error", "system", "Fehler beim Speichern der E3DC-Konfiguration", error instanceof Error ? error.message : String(error));
        }
      } else if (e3dcClient.isConfigured()) {
        e3dcClient.disconnect();
        log("info", "system", "E3DC-Konfiguration entfernt");
      }
      
      // WICHTIG: Wenn Strategie geändert wurde, Battery Lock aktivieren/deaktivieren
      if (strategyChanged && newStrategy) {
        // Lazy-init Strategy Controller falls noch nicht vorhanden
        if (!strategyController) {
          strategyController = new ChargingStrategyController(sendUdpCommand);
        }
        
        try {
          log("info", "system", `Ladestrategie gewechselt auf: ${newStrategy}`);
          await strategyController.handleStrategyChange(newStrategy);
        } catch (error) {
          log("warning", "system", "Battery Lock konnte nicht gesetzt werden", error instanceof Error ? error.message : String(error));
          // Nicht kritisch - Strategie wurde trotzdem gespeichert
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Invalid settings data" });
    }
  });

  app.get("/api/controls", (req, res) => {
    const state = storage.getControlState();
    res.json(state);
  });

  app.get("/api/wallbox/plug-tracking", (req, res) => {
    const tracking = storage.getPlugStatusTracking();
    res.json(tracking);
  });

  app.get("/api/e3dc/live-data", async (req, res) => {
    try {
      const settings = storage.getSettings();
      
      // Hole Wallbox-Leistung direkt über UDP (Report 3)
      let wallboxPower = 0; // in Watt
      if (settings?.wallboxIp) {
        try {
          const report3 = await sendUdpCommand(settings.wallboxIp, "report 3");
          // Power ist in Report 3 als P (in Milliwatt), dividiert durch 1000000 für kW
          // Wir brauchen Watt, also dividieren wir nur durch 1000
          wallboxPower = (report3?.P || 0) / 1000;
        } catch (error) {
          log("warning", "system", "Konnte Wallbox-Leistung nicht abrufen, verwende 0W", error instanceof Error ? error.message : String(error));
        }
      }

      // E3DC IP erforderlich (im Demo-Modus: 127.0.0.1:5502 für Unified Mock Server)
      if (!settings?.e3dcIp) {
        log("error", "system", "E3DC IP nicht konfiguriert - bitte in Einstellungen setzen");
        return res.status(400).json({ 
          error: "E3DC IP nicht konfiguriert" 
        });
      }

      // Verbinde zum E3DC Modbus (echtes System oder Unified Mock Server im Demo-Modus)
      const e3dcService = getE3dcModbusService();
      
      try {
        // Stelle Verbindung her (wiederverwendet bestehende Verbindung wenn bereits verbunden)
        await e3dcService.connect(settings.e3dcIp);
        
        // Lese Live-Daten mit aktueller Wallbox-Leistung
        const liveData = await e3dcService.readLiveData(wallboxPower);
        
        log("debug", "system", `E3DC Live-Daten erfolgreich abgerufen: PV=${liveData.pvPower}W, Batterie=${liveData.batteryPower}W, Haus=${liveData.housePower}W, Wallbox=${liveData.wallboxPower}W`);
        
        res.json(liveData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log("error", "system", "Fehler beim Abrufen der E3DC Live-Daten", errorMessage);
        
        res.status(500).json({ 
          error: `E3DC Modbus-Fehler: ${errorMessage}` 
        });
      }
    } catch (error) {
      log("error", "system", "Unerwarteter Fehler bei E3DC Live-Daten Abfrage", error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/controls", async (req, res) => {
    try {
      // Frischer State vom Storage für Vergleich
      const currentStorageState = storage.getControlState();
      
      // Parse und validiere Request, aber entferne nightCharging (scheduler-only)
      const state = controlStateSchema.parse(req.body);
      delete (state as any).nightCharging; // Entferne nightCharging aus Request
      
      const settings = storage.getSettings();

      // Merke welche Felder tatsächlich geändert werden sollen
      const changedFields = {
        pvSurplus: state.pvSurplus !== currentStorageState.pvSurplus,
        batteryLock: state.batteryLock !== currentStorageState.batteryLock,
        gridCharging: state.gridCharging !== currentStorageState.gridCharging,
      };

      if (changedFields.pvSurplus) {
        log("info", "system", `PV-Überschussladung ${state.pvSurplus ? "aktiviert" : "deaktiviert"}`);
        
        // Sende Wallbox-Phasen-Umschaltung (Mock versteht "mode pv", echte Wallbox ignoriert)
        if (settings?.wallboxIp) {
          try {
            await sendUdpCommand(settings.wallboxIp, `mode pv ${state.pvSurplus ? '1' : '0'}`);
            log("info", "wallbox", `Wallbox ${state.pvSurplus ? "auf einphasige (6-32A)" : "auf dreiphasige (6-16A)"} Ladung umgeschaltet`);
          } catch (error) {
            // Fehler ignorieren - echte Wallbox kennt diesen Befehl nicht, das ist ok
            log("debug", "wallbox", `mode pv Befehl ignoriert (normale Wallbox kennt diesen Befehl nicht)`);
          }
        }
        
        // SmartHome-URL aufrufen (nur wenn konfiguriert)
        await callSmartHomeUrl(
          state.pvSurplus ? settings?.pvSurplusOnUrl : settings?.pvSurplusOffUrl
        );
      }

      if (changedFields.batteryLock) {
        log("info", "system", `Batterie entladen sperren ${state.batteryLock ? "aktiviert" : "deaktiviert"}`);
        if (state.batteryLock) {
          await lockBatteryDischarge(settings);
        } else {
          await unlockBatteryDischarge(settings);
        }
      }

      if (changedFields.gridCharging) {
        log("info", "system", `Netzstrom-Laden ${state.gridCharging ? "aktiviert" : "deaktiviert"}`);
        if (state.gridCharging) {
          await enableGridCharging(settings);
        } else {
          await disableGridCharging(settings);
        }
      }

      // Atomar: Nur die tatsächlich geänderten Felder aktualisieren
      // nightCharging wird NIE vom Request übernommen (scheduler-only)
      const updates: Partial<ControlState> = {};
      if (changedFields.pvSurplus) updates.pvSurplus = state.pvSurplus;
      if (changedFields.batteryLock) updates.batteryLock = state.batteryLock;
      if (changedFields.gridCharging) updates.gridCharging = state.gridCharging;
      
      storage.updateControlState(updates);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Invalid control state data" });
    }
  });

  app.post("/api/controls/sync", async (req, res) => {
    // Endpoint nur für Kompatibilität beibehalten - keine FHEM-Synchronisation mehr
    const currentState = storage.getControlState();
    res.json(currentState);
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

  // === CHARGING STRATEGY API ROUTES ===
  
  app.get("/api/charging/context", (req, res) => {
    try {
      const context = storage.getChargingContext();
      res.json(context);
    } catch (error) {
      log("error", "system", "Fehler beim Abrufen des Charging Context", error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to retrieve charging context" });
    }
  });

  app.post("/api/charging/strategy", async (req, res) => {
    try {
      const strategyRequestSchema = z.object({
        strategy: chargingStrategySchema,
      });
      
      const parsed = strategyRequestSchema.parse(req.body);
      const { strategy } = parsed;

      const settings = storage.getSettings();
      if (!settings?.chargingStrategy) {
        return res.status(400).json({ error: "Strategy configuration not found" });
      }

      const updatedConfig = {
        ...settings.chargingStrategy,
        activeStrategy: strategy,
      };

      storage.saveSettings({
        ...settings,
        chargingStrategy: updatedConfig,
      });

      // WICHTIG: Battery Lock aktivieren/deaktivieren basierend auf Strategie
      if (strategyController) {
        try {
          await strategyController.handleStrategyChange(strategy);
        } catch (error) {
          log("warning", "system", "Battery Lock konnte nicht gesetzt werden", error instanceof Error ? error.message : String(error));
          // Nicht kritisch - Strategie wurde trotzdem gespeichert
        }
      }

      log("info", "system", `Ladestrategie gewechselt auf: ${strategy}`);
      res.json({ success: true, strategy });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: error.errors 
        });
      }
      log("error", "system", "Fehler beim Wechseln der Ladestrategie", error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to switch strategy" });
    }
  });

  app.post("/api/charging/strategy/config", async (req, res) => {
    try {
      const config = chargingStrategyConfigSchema.parse(req.body);
      const settings = storage.getSettings();

      if (!settings) {
        return res.status(400).json({ error: "Settings not found" });
      }

      storage.saveSettings({
        ...settings,
        chargingStrategy: config,
      });

      log("info", "system", "Ladestrategie-Konfiguration aktualisiert");
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid configuration data",
          details: error.errors 
        });
      }
      log("error", "system", "Fehler beim Speichern der Strategie-Konfiguration", error instanceof Error ? error.message : String(error));
      res.status(500).json({ error: "Failed to save strategy configuration" });
    }
  });


  // Hilfsfunktion um aktuelle Zeit in der konfigurierten Zeitzone zu erhalten
  const getCurrentTimeInTimezone = (timezone: string = "Europe/Berlin"): string => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('de-DE', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    const hours = parts.find(p => p.type === 'hour')?.value || '00';
    const minutes = parts.find(p => p.type === 'minute')?.value || '00';
    
    return `${hours}:${minutes}`;
  };

  // Hilfsfunktion für Batterie-Entladesperre (E3DC)
  const lockBatteryDischarge = async (settings: any) => {
    if (settings?.e3dc?.enabled && e3dcClient.isConfigured()) {
      log("info", "system", `Batterie-Entladesperre: Verwende E3DC-Integration${settings?.demoMode ? ' (Demo-Modus)' : ''}`);
      await e3dcClient.lockDischarge();
    } else {
      log("warning", "system", `Batterie-Entladesperre: E3DC nicht konfiguriert`);
    }
  };

  const unlockBatteryDischarge = async (settings: any) => {
    if (settings?.e3dc?.enabled && e3dcClient.isConfigured()) {
      log("info", "system", `Batterie-Entladesperre aufheben: Verwende E3DC-Integration${settings?.demoMode ? ' (Demo-Modus)' : ''}`);
      await e3dcClient.unlockDischarge();
    } else {
      log("warning", "system", `Batterie-Entladesperre aufheben: E3DC nicht konfiguriert`);
    }
  };

  // Hilfsfunktion für Netzstrom-Laden (E3DC)
  const enableGridCharging = async (settings: any) => {
    if (settings?.e3dc?.enabled && e3dcClient.isConfigured()) {
      try {
        log("info", "system", `Netzstrom-Laden: Verwende E3DC-Integration${settings?.demoMode ? ' (Demo-Modus)' : ''}`);
        await e3dcClient.enableGridCharge();
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        log("error", "system", `E3DC-Fehler beim Aktivieren des Netzstrom-Ladens`, errorMessage);
      }
    } else {
      log("warning", "system", `Netzstrom-Laden: E3DC nicht konfiguriert`);
    }
  };

  const disableGridCharging = async (settings: any) => {
    if (settings?.e3dc?.enabled && e3dcClient.isConfigured()) {
      try {
        log("info", "system", `Netzstrom-Laden deaktivieren: Verwende E3DC-Integration${settings?.demoMode ? ' (Demo-Modus)' : ''}`);
        await e3dcClient.disableGridCharge();
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        log("error", "system", `E3DC-Fehler beim Deaktivieren des Netzstrom-Ladens`, errorMessage);
      }
    } else {
      log("warning", "system", `Netzstrom-Laden deaktivieren: E3DC nicht konfiguriert`);
    }
  };

  // === CHARGING STRATEGY SCHEDULER ===
  let chargingStrategyInterval: NodeJS.Timeout | null = null;
  let strategyController: ChargingStrategyController | null = null;

  const checkChargingStrategy = async () => {
    try {
      const settings = storage.getSettings();
      const controlState = storage.getControlState();
      
      // Skip wenn keine Wallbox IP konfiguriert
      if (!settings?.wallboxIp) {
        return;
      }

      // Context auf "off" setzen wenn Strategy deaktiviert + Wallbox stoppen
      const strategyConfig = settings.chargingStrategy;
      if (!strategyConfig || strategyConfig.activeStrategy === "off") {
        // Lazy-init Controller für stopChargingForStrategyOff
        if (!strategyController) {
          strategyController = new ChargingStrategyController(sendUdpCommand);
        }
        
        // Wallbox stoppen (falls sie noch lädt)
        await strategyController.stopChargingForStrategyOff(settings.wallboxIp);
        return;
      }

      // Validiere Strategie-Config mit Zod (verhindert Crash bei fehlenden Feldern)
      try {
        chargingStrategyConfigSchema.parse(strategyConfig);
      } catch (error) {
        log("warning", "system", "Strategie-Config unvollständig - überspringe Ausführung. Bitte Config in Settings vervollständigen.");
        return;
      }

      // Skip wenn Night Charging aktiv (höhere Priorität)
      if (controlState.nightCharging) {
        log("info", "system", "Night Charging aktiv - Strategie pausiert");
        return;
      }

      // Lazy-init Controller
      if (!strategyController) {
        strategyController = new ChargingStrategyController(sendUdpCommand);
      }

      // Hole E3DC Live-Daten (mit Wallbox-Leistung 0 für Überschuss-Berechnung)
      if (!settings.e3dcIp) {
        log("info", "system", "E3DC IP nicht konfiguriert - Strategie kann nicht ausgeführt werden");
        return;
      }

      const modbusService = getE3dcModbusService();
      if (!modbusService) {
        log("info", "system", "E3DC Modbus Service nicht verfügbar - Strategie kann nicht ausgeführt werden");
        return;
      }

      // Stelle Verbindung zum E3DC her (falls noch nicht geschehen)
      try {
        await modbusService.connect(settings.e3dcIp);
      } catch (error) {
        log("error", "system", "Fehler beim Verbinden zum E3DC Modbus Service", error instanceof Error ? error.message : String(error));
        return;
      }

      // Hole aktuelle Wallbox-Leistung für korrekte Überschuss-Berechnung
      let currentWallboxPower = 0;
      try {
        const report3 = await sendUdpCommand(settings.wallboxIp, "report 3");
        // Power ist in Report 3 als P (in Milliwatt), dividiert durch 1000 für Watt
        currentWallboxPower = (report3?.P || 0) / 1000;
      } catch (error) {
        // Falls Wallbox-Abfrage fehlschlägt, nutze 0W als Fallback
        log("debug", "system", "Wallbox-Abfrage für E3DC-Surplus fehlgeschlagen - nutze 0W", error instanceof Error ? error.message : String(error));
      }

      let e3dcLiveData;
      try {
        e3dcLiveData = await modbusService.readLiveData(currentWallboxPower);
      } catch (error) {
        log("error", "system", "Fehler beim Abrufen der E3DC-Daten", error instanceof Error ? error.message : String(error));
        return;
      }

      // Führe Strategie aus
      log("info", "system", `Strategy Check: ${strategyConfig.activeStrategy}`);
      await strategyController.processStrategy(
        e3dcLiveData,
        settings.wallboxIp
      );

    } catch (error) {
      log("error", "system", "Fehler im Charging Strategy Scheduler", error instanceof Error ? error.message : String(error));
    }
  };

  // Scheduler für zeitgesteuerte Ladung
  let nightChargingSchedulerInterval: NodeJS.Timeout | null = null;
  
  const checkNightChargingSchedule = async () => {
    try {
      const settings = storage.getSettings();
      const schedule = settings?.nightChargingSchedule;
      const currentState = storage.getControlState();
      
      const currentTime = getCurrentTimeInTimezone("Europe/Berlin");
      
      log("debug", "system", `Scheduler für zeitgesteuerte Ladung läuft - Aktuelle Zeit: ${currentTime}, Zeitsteuerung aktiviert: ${schedule?.enabled}, Zeitfenster: ${schedule?.startTime}-${schedule?.endTime}`);
      
      // Wenn Scheduler deaktiviert wurde, aber Wallbox noch lädt -> stoppen
      if (!schedule?.enabled) {
        if (currentState.nightCharging) {
          log("info", "system", `Zeitgesteuerte Ladung: Zeitsteuerung deaktiviert - stoppe Laden`);
          
          // Stoppe die Wallbox (kann fehlschlagen)
          if (settings?.wallboxIp) {
            try {
              await sendUdpCommand(settings.wallboxIp, "ena 0");
            } catch (error) {
              log("error", "system", "Zeitgesteuerte Ladung: Fehler beim Stoppen der Wallbox (Scheduler deaktiviert)", error instanceof Error ? error.message : String(error));
            }
          }
          
          // Deaktiviere Batterie-Entladesperre beim Deaktivieren des Schedulers (immer)
          log("info", "system", `Zeitgesteuerte Ladung: Deaktiviere Batterie-Entladesperre (Scheduler deaktiviert)`);
          await unlockBatteryDischarge(settings);
          
          // Deaktiviere Netzstrom-Laden falls aktiviert
          if (e3dcClient.isConfigured() && e3dcClient.isGridChargeDuringNightChargingEnabled()) {
            // Demo-Modus-Check: Keine echten CLI-Befehle im Demo-Modus
            if (settings?.demoMode) {
              log("info", "system", `Zeitgesteuerte Ladung: Netzstrom-Laden deaktivieren - Demo-Modus (simuliert)`);
            } else {
              try {
                log("info", "system", `Zeitgesteuerte Ladung: Deaktiviere Netzstrom-Laden (Scheduler deaktiviert)`);
                await e3dcClient.disableGridCharge();
              } catch (error) {
                log("error", "system", "Fehler beim Deaktivieren des Netzstrom-Ladens", error instanceof Error ? error.message : String(error));
              }
            }
          }
          
          storage.saveControlState({ ...currentState, nightCharging: false, batteryLock: false, gridCharging: false });
        }
        return;
      }
      
      const isInTimeWindow = isTimeInRange(currentTime, schedule.startTime, schedule.endTime);
      
      if (isInTimeWindow && !currentState.nightCharging) {
        log("info", "system", `Zeitgesteuerte Ladung: Zeitfenster erreicht (${schedule.startTime}-${schedule.endTime}) - starte Laden`);
        
        // Aktiviere Batterie-Entladesperre beim Start der zeitgesteuerten Ladung (ZUERST!)
        log("info", "system", `Zeitgesteuerte Ladung: Aktiviere Batterie-Entladesperre`);
        await lockBatteryDischarge(settings);
        
        // Aktiviere Netzstrom-Laden falls konfiguriert
        let gridChargingActive = false;
        if (e3dcClient.isConfigured() && e3dcClient.isGridChargeDuringNightChargingEnabled()) {
          // Demo-Modus-Check: Keine echten CLI-Befehle im Demo-Modus
          if (settings?.demoMode) {
            log("info", "system", `Zeitgesteuerte Ladung: Netzstrom-Laden aktivieren - Demo-Modus (simuliert)`);
            gridChargingActive = true; // Simuliere Erfolg
          } else {
            try {
              log("info", "system", `Zeitgesteuerte Ladung: Aktiviere Netzstrom-Laden`);
              await e3dcClient.enableGridCharge();
              gridChargingActive = true;
            } catch (error) {
              log("error", "system", "Fehler beim Aktivieren des Netzstrom-Ladens", error instanceof Error ? error.message : String(error));
            }
          }
        }
        
        // Dann starte die Wallbox (kann fehlschlagen, aber Batterie-Sperre ist bereits aktiv)
        if (settings?.wallboxIp) {
          try {
            await sendUdpCommand(settings.wallboxIp, "ena 1");
          } catch (error) {
            log("error", "system", "Zeitgesteuerte Ladung: Fehler beim Starten der Wallbox (Batterie-Sperre ist aktiv)", error instanceof Error ? error.message : String(error));
          }
        }
        
        storage.saveControlState({ ...currentState, nightCharging: true, batteryLock: true, gridCharging: gridChargingActive });
      } else if (!isInTimeWindow && currentState.nightCharging) {
        log("info", "system", `Zeitgesteuerte Ladung: Zeitfenster beendet - stoppe Laden`);
        
        // Stoppe die Wallbox (kann fehlschlagen)
        if (settings?.wallboxIp) {
          try {
            await sendUdpCommand(settings.wallboxIp, "ena 0");
          } catch (error) {
            log("error", "system", "Zeitgesteuerte Ladung: Fehler beim Stoppen der Wallbox", error instanceof Error ? error.message : String(error));
          }
        }
        
        // Deaktiviere Batterie-Entladesperre beim Ende der zeitgesteuerten Ladung (immer)
        log("info", "system", `Zeitgesteuerte Ladung: Deaktiviere Batterie-Entladesperre`);
        await unlockBatteryDischarge(settings);
        
        // Deaktiviere Netzstrom-Laden falls aktiviert
        if (e3dcClient.isConfigured() && e3dcClient.isGridChargeDuringNightChargingEnabled()) {
          // Demo-Modus-Check: Keine echten CLI-Befehle im Demo-Modus
          if (settings?.demoMode) {
            log("info", "system", `Zeitgesteuerte Ladung: Netzstrom-Laden deaktivieren - Demo-Modus (simuliert)`);
          } else {
            try {
              log("info", "system", `Zeitgesteuerte Ladung: Deaktiviere Netzstrom-Laden`);
              await e3dcClient.disableGridCharge();
            } catch (error) {
              log("error", "system", "Fehler beim Deaktivieren des Netzstrom-Ladens", error instanceof Error ? error.message : String(error));
            }
          }
        }
        
        storage.saveControlState({ ...currentState, nightCharging: false, batteryLock: false, gridCharging: false });
      }
    } catch (error) {
      log("error", "system", "Fehler beim Scheduler für zeitgesteuerte Ladung", String(error));
    }
  };
  
  // Hilfsfunktion um zu prüfen ob eine Zeit in einem Zeitfenster liegt
  const isTimeInRange = (current: string, start: string, end: string): boolean => {
    const [currentH, currentM] = current.split(':').map(Number);
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    
    const currentMinutes = currentH * 60 + currentM;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    // Handle overnight time windows (e.g., 23:00 - 05:00)
    if (endMinutes < startMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  };
  
  // Lade E3DC-Konfiguration beim Start wenn vorhanden
  const initialSettings = storage.getSettings();
  if (initialSettings?.e3dc?.enabled) {
    try {
      e3dcClient.configure(initialSettings.e3dc);
      log("info", "system", "E3DC-Konfiguration beim Start geladen");
    } catch (error) {
      log("error", "system", "Fehler beim Laden der E3DC-Konfiguration beim Start", error instanceof Error ? error.message : String(error));
    }
  }

  // Starte Scheduler synchronisiert zur vollen Minute
  log("info", "system", "Scheduler für zeitgesteuerte Ladung wird gestartet - prüft jede volle Minute");
  
  // Berechne Verzögerung bis zur nächsten vollen Minute
  const now = new Date();
  const secondsUntilNextMinute = 60 - now.getSeconds();
  const msUntilNextMinute = (secondsUntilNextMinute * 1000) - now.getMilliseconds();
  
  log("debug", "system", `Scheduler-Synchronisation: Nächste Prüfung in ${secondsUntilNextMinute}s zur vollen Minute`);
  
  // Erste Prüfung zur nächsten vollen Minute
  setTimeout(() => {
    checkNightChargingSchedule();
    
    // Danach jede Minute exakt zur vollen Minute
    nightChargingSchedulerInterval = setInterval(checkNightChargingSchedule, 60 * 1000);
  }, msUntilNextMinute);
  
  // Initiale Prüfung beim Start (optional - prüft sofort)
  checkNightChargingSchedule();

  // === STARTE CHARGING STRATEGY SCHEDULER ===
  log("info", "system", "Scheduler für automatische Ladestrategien wird gestartet - prüft alle 15 Sekunden");
  
  // Starte sofort und dann alle 15 Sekunden
  checkChargingStrategy();
  chargingStrategyInterval = setInterval(checkChargingStrategy, 15 * 1000);

  const httpServer = createServer(app);

  return httpServer;
}
