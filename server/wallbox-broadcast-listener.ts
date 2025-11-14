/**
 * Wallbox Broadcast Listener
 * 
 * Lauscht auf UDP-Broadcasts der KEBA Wallbox auf Port 7090.
 * Reagiert auf verschiedene Broadcast-Typen:
 * - Input → Ladestrategie-Wechsel basierend auf potenzialfreiem Kontakt X1
 * - Plug → Kabelstatus-Änderungen in Echtzeit
 * - E pres → Session-Energie während der Ladung
 * - State → Wallbox-Status-Änderungen
 * 
 * Verwendet den zentralen UDP-Channel (kein eigener Socket).
 */

import { log } from './logger';
import { storage } from './storage';
import { wallboxUdpChannel } from './wallbox-udp-channel';
import { ChargingStrategyController } from './charging-strategy-controller';

let lastInputStatus: number | null = null;
let lastPlugStatus: number | null = null;
let lastState: number | null = null;
let isEnabled = false;
let strategyController: ChargingStrategyController | null = null;
let sendUdpCommand: ((ip: string, command: string) => Promise<any>) | null = null;

// Handler für Broadcast-Nachrichten (async für stopChargingForStrategyOff)
const handleBroadcast = async (data: any, rinfo: any) => {
  let targetStrategy: any = null;

  try {
    // Verarbeite Plug-Status-Broadcasts
    // Nutzt In-Memory-Tracking für schnelle Änderungs-Erkennung
    if (data.Plug !== undefined) {
      const plugStatus = data.Plug;
      
      // Prüfe ob Status sich geändert hat (In-Memory-Vergleich)
      if (lastPlugStatus !== null && lastPlugStatus !== plugStatus) {
        log("info", "system", `[Wallbox-Broadcast-Listener] Plug-Status geändert: ${lastPlugStatus} → ${plugStatus} (von ${rinfo.address})`);
        
        // Aktualisiere Plug-Tracking mit Zeitstempel
        try {
          storage.savePlugStatusTracking({
            lastPlugStatus: plugStatus,
            lastPlugChange: new Date().toISOString(),
          });
        } catch (error) {
          log("error", "system", "[Wallbox-Broadcast-Listener] Fehler beim Speichern des Plug-Status:", error instanceof Error ? error.message : String(error));
        }
      } else if (lastPlugStatus === null) {
        // Erster Broadcast - initialisiere Storage ohne Log (verhindert false-positive bei Startup)
        try {
          storage.savePlugStatusTracking({
            lastPlugStatus: plugStatus,
          });
        } catch (error) {
          log("error", "system", "[Wallbox-Broadcast-Listener] Fehler beim Initialisieren des Plug-Status:", error instanceof Error ? error.message : String(error));
        }
      }
      
      // Update In-Memory-Tracker für nächsten Broadcast
      lastPlugStatus = plugStatus;
    }

    // Verarbeite State-Broadcasts
    // DESIGN: State wird nur geloggt, nicht persistiert.
    // Grund: Wallbox-Status wird bereits durch /api/wallbox/status Polling abgerufen.
    // Dieser Handler dient als zusätzliche Debugging-Information für schnellere Erkennung.
    if (data.State !== undefined) {
      const state = data.State;
      
      if (state !== lastState && lastState !== null) {
        const stateNames: Record<number, string> = {
          0: "starting",
          1: "not ready for charging",
          2: "ready for charging",
          3: "charging",
          4: "error",
          5: "authorization rejected",
        };
        
        log("info", "system", `[Wallbox-Broadcast-Listener] State geändert: ${lastState} → ${state} (${stateNames[state] || 'unknown'}) (von ${rinfo.address})`);
      }
      
      lastState = state;
    }

    // Verarbeite E pres-Broadcasts (während Ladung)
    // Throttle E pres Logging um Log-Flooding zu vermeiden (alle 3s von Mock)
    if (data["E pres"] !== undefined) {
      // E pres wird vom Frontend per Polling abgerufen
      // Kein Logging nötig (würde Logs überschwemmen bei 3s-Interval)
    }

    // Reagiere auf Input-Broadcasts (Ladestrategie-Wechsel)
    if (data.Input === undefined) {
      return; // Keine Input-Änderung
    }

    const inputStatus = data.Input;

    // Nur reagieren wenn sich der Status ändert
    if (inputStatus === lastInputStatus) {
      return;
    }

    lastInputStatus = inputStatus;

    log("info", "system", `[Wallbox-Broadcast-Listener] Input-Status geändert: ${inputStatus} (von ${rinfo.address})`);

    // Reagiere auf Input-Änderung
    if (inputStatus === 1) {
      // Hole konfigurierte Strategie aus den Einstellungen
      const settings = storage.getSettings();
      targetStrategy = settings?.chargingStrategy?.inputX1Strategy ?? "max_without_battery";
      
      log("info", "system", `[Wallbox-Broadcast-Listener] Aktiviere Ladestrategie: ${targetStrategy}`);
      
      // WICHTIG: Battery Lock aktivieren (für E3DC S10) wenn Strategie max_without_battery
      if (strategyController) {
        try {
          await strategyController.handleStrategyChange(targetStrategy);
        } catch (error) {
          log("error", "system", "[Wallbox-Broadcast-Listener] Strategie-Wechsel fehlgeschlagen:", error instanceof Error ? error.message : String(error));
          // Fortfahren - Strategie wird trotzdem gesetzt (finally-Block)
        }
      } else {
        log("warning", "system", "[Wallbox-Broadcast-Listener] ChargingStrategyController nicht verfügbar");
      }
    } else if (inputStatus === 0) {
      targetStrategy = "off";
      log("info", "system", "[Wallbox-Broadcast-Listener] Deaktiviere Ladestrategie: Aus");
      
      // Verwende den ChargingStrategyController für zentralisierte Stopp-Logik
      const settings = storage.getSettings();
      if (settings?.wallboxIp && strategyController) {
        try {
          await strategyController.stopChargingForStrategyOff(settings.wallboxIp);
        } catch (error) {
          log("error", "system", "[Wallbox-Broadcast-Listener] Wallbox stoppen fehlgeschlagen:", error instanceof Error ? error.message : String(error));
          // Fortfahren - Strategie wird trotzdem auf "off" gesetzt (finally-Block)
        }
      } else {
        log("warning", "system", "[Wallbox-Broadcast-Listener] ChargingStrategyController nicht verfügbar - Wallbox nicht gestoppt");
      }
    }
  } catch (error) {
    log("error", "system", "[Wallbox-Broadcast-Listener] Nachricht verarbeiten fehlgeschlagen:", error instanceof Error ? error.message : String(error));
  } finally {
    // KRITISCH: Strategie IMMER setzen, auch wenn Controller-Aufrufe fehlschlagen
    // Dies verhindert inkonsistente States zwischen Input und Strategie
    if (targetStrategy !== null) {
      try {
        // WICHTIG: Context NACH Controller-Aufrufen neu laden, um Updates nicht zu überschreiben
        const freshContext = storage.getChargingContext();
        
        // Nur Strategie ändern, wenn sie sich vom Ziel unterscheidet
        if (freshContext.strategy !== targetStrategy) {
          storage.saveChargingContext({
            ...freshContext,
            strategy: targetStrategy
          });
          log("info", "system", `[Wallbox-Broadcast-Listener] Strategie persistent gesetzt: ${targetStrategy}`);
        }

        const settings = storage.getSettings();
        if (settings?.chargingStrategy && settings.chargingStrategy.activeStrategy !== targetStrategy) {
          settings.chargingStrategy.activeStrategy = targetStrategy;
          storage.saveSettings(settings);
          log("info", "system", `[Wallbox-Broadcast-Listener] Settings persistent gesetzt: ${targetStrategy}`);
        }
      } catch (persistError) {
        log("error", "system", "[Wallbox-Broadcast-Listener] KRITISCH: Strategie-Persistierung fehlgeschlagen:", persistError instanceof Error ? persistError.message : String(persistError));
      }
    }
  }
};

export async function startBroadcastListener(
  udpCommandSender: (ip: string, command: string) => Promise<any>
): Promise<void> {
  if (isEnabled) {
    log("debug", "system", "[Wallbox-Broadcast-Listener] Läuft bereits");
    return;
  }

  // Speichere sendUdpCommand für ChargingStrategyController
  sendUdpCommand = udpCommandSender;
  strategyController = new ChargingStrategyController(udpCommandSender);

  // Registriere Broadcast-Handler beim UDP-Channel
  wallboxUdpChannel.onBroadcast(handleBroadcast);

  isEnabled = true;
  
  // Hole konfigurierte X1-Strategie für Logging
  const settings = storage.getSettings();
  const x1Strategy = settings?.chargingStrategy?.inputX1Strategy ?? "max_without_battery";
  
  log("info", "system", "✅ [Wallbox-Broadcast-Listener] Lauscht auf Wallbox-Broadcasts (Port 7090)");
  log("info", "system", `   - Input → Ladestrategie-Wechsel (X1=1: '${x1Strategy}', X1=0: 'Aus')`);
  log("info", "system", "   - Plug → Kabelstatus-Tracking in Echtzeit");
  log("info", "system", "   - State → Wallbox-Status-Änderungen");
  log("info", "system", "   - E pres → Session-Energie während Ladung");
}

export async function stopBroadcastListener(): Promise<void> {
  if (!isEnabled) {
    return;
  }

  // Deregistriere Handler
  wallboxUdpChannel.offBroadcast(handleBroadcast);

  isEnabled = false;
  lastInputStatus = null;
  lastPlugStatus = null;
  lastState = null;
  strategyController = null;
  sendUdpCommand = null;
  log("info", "system", "✅ [Wallbox-Broadcast-Listener] Gestoppt");
}

export function isBroadcastListenerEnabled(): boolean {
  return isEnabled;
}
