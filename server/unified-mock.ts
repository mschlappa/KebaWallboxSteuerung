/**
 * Unified Mock Server für EnergyLink Demo-Modus
 * 
 * Simuliert mehrere Geräte in einem Prozess:
 * - KEBA Wallbox P20/P30 (UDP Port 7090)
 * - E3DC S10 Hauskraftwerk (Modbus TCP Port 5502)
 * - FHEM SmartHome Server (HTTP Port 8083)
 * - Shared State für realistische Interaktion
 * 
 * Verwendung: tsx server/unified-mock.ts
 */

import dgram from 'dgram';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { wallboxMockService } from './wallbox-mock';
import { e3dcMockService } from './e3dc-mock';
// @ts-ignore - modbus-serial has incomplete type definitions
import ModbusRTU from 'modbus-serial';
import type { ControlState, Settings } from '@shared/schema';
import { log } from './logger';

// Port-Konfiguration
const WALLBOX_UDP_PORT = 7090;
const E3DC_MODBUS_PORT = 5502;
const FHEM_HTTP_PORT = 8083;
const HOST = '0.0.0.0';

// Hilfsfunktion: Lade Control State
const loadControlState = async (): Promise<ControlState | null> => {
  try {
    const data = await fs.readFile(path.join(process.cwd(), 'data', 'control-state.json'), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
};

// Hilfsfunktion: Lade Settings
const loadSettings = async (): Promise<Settings | null> => {
  try {
    const data = await fs.readFile(path.join(process.cwd(), 'data', 'settings.json'), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
};

// Hilfsfunktion: Parse Grid Charge Leistung aus E3DC Command
const parseGridChargePower = (command: string | undefined): number => {
  if (!command) return 2500; // Default 2.5 kW
  
  // Suche nach "-c XXXX" Pattern
  const match = command.match(/-c\s+(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  return 2500; // Default
};

// FHEM Device States
const fhemDeviceStates = new Map<string, boolean>();
fhemDeviceStates.set('autoWallboxPV', false); // Standard: PV-Überschuss aus

// =============================================================================
// FHEM HTTP SERVER (Port 8083)
// =============================================================================

const fhemServer = http.createServer((req, res) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  log("debug", "system", `[FHEM-HTTP] ${req.method} ${url.pathname}${url.search}`);

  // CORS Headers für lokale Entwicklung
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Nur GET-Requests verarbeiten
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Parse FHEM-Befehle aus der URL
  // Beispiel: /fhem?cmd.autoWallboxPV=on
  // Beispiel: /fhem?cmd=set%20autoWallboxPV%20on
  // Beispiel: /fhem?detail=autoWallboxPV (Status abfragen)
  
  const params = url.searchParams;
  
  // Status abfragen (für getFhemDeviceState)
  if (params.has('detail')) {
    const deviceName = params.get('detail') || '';
    const deviceState = fhemDeviceStates.get(deviceName) ?? false;
    const stateStr = deviceState ? 'on' : 'off';
    
    log("debug", "system", `[FHEM-HTTP] Status-Abfrage: ${deviceName} = ${stateStr}`);
    
    // Generiere FHEM-typische HTML-Response
    const html = `
<!DOCTYPE html>
<html>
<head><title>FHEM Mock - ${deviceName}</title></head>
<body>
  <div class="deviceName">${deviceName}</div>
  <div informId="${deviceName}-state">${stateStr}</div>
</body>
</html>`;
    
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Befehl ausführen (für callSmartHomeUrl)
  // Format: cmd.DEVICE=VALUE oder cmd=set DEVICE VALUE
  let deviceName: string | null = null;
  let newState: boolean | null = null;

  // Format 1: cmd.autoWallboxPV=on
  params.forEach((value, key) => {
    if (key.startsWith('cmd.')) {
      deviceName = key.substring(4); // Entferne "cmd."
      newState = value.toLowerCase() === 'on';
    }
  });

  // Format 2: cmd=set autoWallboxPV on (URL-encoded)
  if (!deviceName && params.has('cmd')) {
    const cmd = params.get('cmd') || '';
    const match = cmd.match(/set\s+(\S+)\s+(on|off)/i);
    if (match) {
      deviceName = match[1];
      newState = match[2].toLowerCase() === 'on';
    }
  }

  if (deviceName && newState !== null) {
    fhemDeviceStates.set(deviceName, newState);
    log("debug", "system", `[FHEM-HTTP] Befehl ausgeführt: ${deviceName} = ${newState ? 'on' : 'off'}`);
    
    // FHEM-typische Response
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body>Command executed: ${deviceName} set to ${newState ? 'on' : 'off'}</body></html>`);
    return;
  }

  // Fallback: Unbekannter Request
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<html><body>FHEM Mock Server - OK</body></html>');
});

fhemServer.on('listening', () => {
  log("info", "system", `✅ [FHEM-HTTP] FHEM Mock läuft auf ${HOST}:${FHEM_HTTP_PORT}`);
  log("info", "system", `   Unterstützt FHEM-typische URLs für Status & Befehle`);
});

fhemServer.on('error', (err) => {
  log("error", "system", `[FHEM-HTTP] Server Error:`, err instanceof Error ? err.message : String(err));
});

// =============================================================================
// WALLBOX UDP HANDLER (verwendet zentralen UDP-Channel)
// =============================================================================

import { wallboxUdpChannel } from './wallbox-udp-channel';

// Command-Handler für KEBA-Befehle
const handleWallboxCommand = (message: string, rinfo: any) => {
  log("debug", "system", `[Wallbox-UDP] Received command: "${message}" from ${rinfo.address}:${rinfo.port}`);
  
  let response: any;
  
  // KEBA-Kommandos verarbeiten
  if (message.startsWith('report ')) {
    const reportNum = message.split(' ')[1];
    if (reportNum === '1') {
      response = wallboxMockService.getReport1();
    } else if (reportNum === '2') {
      response = wallboxMockService.getReport2();
    } else if (reportNum === '3') {
      response = wallboxMockService.getReport3();
    }
  } else if (message.startsWith('ena ') || message.startsWith('curr ')) {
    response = wallboxMockService.executeCommand(message);
  } else if (message.startsWith('mode pv ')) {
    const pvMode = message.split(' ')[2];
    if (pvMode === '1' || pvMode === '0') {
      wallboxMockService.setPvSurplusMode(pvMode === '1');
      log("debug", "system", `[Wallbox-UDP] PV-Surplus-Modus ${pvMode === '1' ? 'aktiviert (1-Phase, 6-32A)' : 'deaktiviert (3-Phase, 6-16A)'}`);
      response = { "TCH-OK": "done" };
    } else {
      response = { "TCH-ERR": "invalid mode value" };
    }
  } else {
    response = { "TCH-ERR": "unknown command" };
  }
  
  // Antwort über Channel senden
  if (response) {
    const responseStr = JSON.stringify(response);
    wallboxUdpChannel.sendCommandResponse(response, rinfo.address, rinfo.port);
    log("debug", "system", `[Wallbox-UDP] Sent: ${responseStr.substring(0, 100)}${responseStr.length > 100 ? '...' : ''}`);
  }
};

// Broadcast-Handler für eigene Mock-Broadcasts (wird ignoriert vom Listener)
const handleWallboxBroadcast = (data: any, rinfo: any) => {
  // Mock-Server ignoriert eigene Broadcasts
  log("debug", "system", `[Wallbox-UDP] Ignoriere eigenen Broadcast: "${JSON.stringify(data).substring(0, 50)}..."`);
};

// =============================================================================
// E3DC MODBUS TCP SERVER (Port 5502)
// =============================================================================

// Modbus Register Mapping (E3DC S10 kompatibel)
// Register 40067-40083 (Holding Registers, Basis-Adresse 40001)
const E3DC_REGISTER_BASE = 66; // 40067 - 40001 = 66

interface ModbusRegisters {
  pvPower: number;        // Register 40067-40068 (INT32)
  batteryPower: number;   // Register 40069-40070 (INT32)
  housePower: number;     // Register 40071-40072 (INT32)
  gridPower: number;      // Register 40073-40074 (INT32)
  batterySoc: number;     // Register 40075 (UINT16)
  autarky: number;        // Register 40081 (UINT16)
  selfConsumption: number;// Register 40083 (UINT16)
}

// Cache für E3DC Live-Daten (aktualisiert alle 1 Sekunde)
let cachedE3dcData: any = null;
let lastE3dcUpdate = 0;
let updatePromise: Promise<any> | null = null;  // Lock für parallele Requests

const updateE3dcCache = async () => {
  const now = Date.now();
  
  // Wenn Update läuft, warte auf das laufende Update (Race Condition vermeiden!)
  if (updatePromise) {
    await updatePromise;
    return cachedE3dcData;
  }
  
  // Wenn Cache gültig ist (< 1 Sekunde alt), verwende Cache
  if (cachedE3dcData && (now - lastE3dcUpdate) <= 1000) {
    return cachedE3dcData;
  }
  
  // Neues Update starten und Lock setzen
  updatePromise = (async () => {
    try {
      const report3 = wallboxMockService.getReport3();
      // KEBA liefert Leistung in Milliwatt (mW), konvertiere zu Watt
      const wallboxPower = (report3.P || 0) / 1000;
      
      // Lade Control State und Settings für E3DC-Steuerung
      const controlState = await loadControlState();
      const settings = await loadSettings();
      
      // Parse Grid Charge Leistung aus Settings
      const gridChargePower = settings?.e3dc?.gridChargeEnableCommand 
        ? parseGridChargePower(settings.e3dc.gridChargeEnableCommand)
        : 2500;
      
      // E3DC Mock liest Battery Lock und Grid Charging aus e3dc-control-state.json
      cachedE3dcData = await e3dcMockService.getLiveData(wallboxPower);
      lastE3dcUpdate = Date.now();
      return cachedE3dcData;
    } finally {
      // Lock freigeben
      updatePromise = null;
    }
  })();
  
  await updatePromise;
  return cachedE3dcData;
};

// Modbus-Server Vector  
const modbusVector = {
  getHoldingRegister: (addr: number, unitID: number, callback: (err: Error | null, value: number) => void) => {
    // Register relativ zur Basis-Adresse
    const registerOffset = addr - E3DC_REGISTER_BASE;
    
    // KRITISCH: Cache SYNCHRON holen und snapshot erstellen
    // Update läuft im Hintergrund und wartet auf Lock falls nötig
    updateE3dcCache()
      .then(data => {
        // SNAPSHOT: Alle Register verwenden diese EINE Daten-Kopie
        const liveData = data || {
          pvPower: 0,
          batteryPower: 0,
          batterySoc: 50,
          housePower: 2000,
          gridPower: 2000,
          wallboxPower: 0,
          autarky: 0,
          selfConsumption: 0,
          timestamp: new Date().toISOString()
        };
        
        try {
          // Convert values to INT32 (Little-Endian: LSW first)
          const toInt32Registers = (value: number): [number, number] => {
            const buffer = Buffer.allocUnsafe(4);
            buffer.writeInt32LE(Math.round(value), 0);
            const lsw = buffer.readUInt16LE(0); // Low word first
            const msw = buffer.readUInt16LE(2); // High word second
            return [lsw, msw];
          };
          
          let registerValue = 0;
          
          // PV Power: Register 67-68 (offset 1-2)
          if (registerOffset === 1 || registerOffset === 2) {
            const [lsw, msw] = toInt32Registers(liveData.pvPower);
            registerValue = registerOffset === 1 ? lsw : msw;
          }
          // Battery Power: Register 69-70 (offset 3-4)
          else if (registerOffset === 3 || registerOffset === 4) {
            const [lsw, msw] = toInt32Registers(liveData.batteryPower);
            registerValue = registerOffset === 3 ? lsw : msw;
          }
          // House Power: Register 71-72 (offset 5-6)
          else if (registerOffset === 5 || registerOffset === 6) {
            const [lsw, msw] = toInt32Registers(liveData.housePower);
            registerValue = registerOffset === 5 ? lsw : msw;
          }
          // Grid Power: Register 73-74 (offset 7-8)
          else if (registerOffset === 7 || registerOffset === 8) {
            const [lsw, msw] = toInt32Registers(liveData.gridPower);
            registerValue = registerOffset === 7 ? lsw : msw;
          }
          // Autarky & SelfConsumption: Register 81 (offset 15) - Combined UINT16
          else if (registerOffset === 15) {
            const autarky = Math.round(liveData.autarky);
            const selfConsumption = Math.round(liveData.selfConsumption);
            registerValue = (autarky << 8) | selfConsumption; // High byte = autarky, low byte = selfConsumption
          }
          // Battery SOC: Register 82 (offset 16)
          else if (registerOffset === 16) {
            registerValue = Math.round(liveData.batterySoc); // SOC in % (50% = 50)
          }
          
          callback(null, registerValue);
        } catch (err) {
          log("error", "system", `[E3DC-Modbus] Error getting register ${addr}:`, err instanceof Error ? err.message : String(err));
          callback(err instanceof Error ? err : new Error(String(err)), 0);
        }
      })
      .catch(err => {
        log("error", "system", `[E3DC-Modbus] Cache update error for register ${addr}:`, err instanceof Error ? err.message : String(err));
        callback(err instanceof Error ? err : new Error(String(err)), 0);
      });
  },
  
  setRegister: (addr: number, value: number, unitID: number) => {
    log("debug", "system", `[E3DC-Modbus] Write not supported: Register ${addr} = ${value}`);
    return;
  }
};

// Modbus Server Variable (wird bei startUnifiedMock() erstellt)
let modbusServer: any = null;

// Broadcast Timer (wird bei startUnifiedMock() erstellt)
let broadcastTimer: NodeJS.Timeout | null = null;

// =============================================================================
// SERVER LIFECYCLE (Start / Stop)
// =============================================================================

let isRunning = false;

export async function startUnifiedMock(): Promise<void> {
  if (isRunning) {
    log("info", "system", "[Unified-Mock] Server läuft bereits");
    return;
  }
  
  log("info", "system", "\n╔════════════════════════════════════════════════════════════╗");
  log("info", "system", "║      EnergyLink Unified Mock Server (Demo-Modus)          ║");
  log("info", "system", "╚════════════════════════════════════════════════════════════╝\n");

  // Wallbox-Mock initialisieren (nur bei Start, nicht bei Import)
  wallboxMockService.initializeDemo();
  
  // Broadcast-Callback setzen (sendet Broadcasts über UDP-Channel)
  wallboxMockService.setBroadcastCallback((data) => {
    log("debug", "system", `[Mock-Wallbox → Broadcast] Sende: ${JSON.stringify(data)}`);
    wallboxUdpChannel.sendBroadcast(data);
  });
  
  // Lade Settings und konfiguriere Mock-Wallbox-Phasen
  const settings = await loadSettings();
  const mockPhases = (settings?.mockWallboxPhases ?? 3) as 1 | 3;
  wallboxMockService.setPhases(mockPhases);
  log("debug", "system", `[Wallbox-Mock] Phasen-Konfiguration gesetzt: ${mockPhases}P`);

  // UDP Channel starten und Handler registrieren
  await wallboxUdpChannel.start();
  wallboxUdpChannel.onCommand(handleWallboxCommand);
  wallboxUdpChannel.onBroadcast(handleWallboxBroadcast);
  log("info", "system", "✅ [Wallbox-UDP] KEBA Mock läuft auf 0.0.0.0:7090");

  // HTTP Server starten
  await new Promise<void>((resolve, reject) => {
    fhemServer.once('error', reject);
    fhemServer.listen(FHEM_HTTP_PORT, HOST, () => {
      fhemServer.removeListener('error', reject);
      resolve();
    });
  });

  // Modbus Server erstellen und starten
  // @ts-ignore - ServerTCP existiert, aber Type Definition ist unvollständig
  modbusServer = new ModbusRTU.ServerTCP(modbusVector, {
    host: HOST,
    port: E3DC_MODBUS_PORT,
    debug: false,
    unitID: 1
  });

  // Modbus Server Event-Handler
  modbusServer.on('socketError', (err: Error) => {
    log('error', 'system', '[E3DC-Modbus] Socket Error', err.message);
  });

  modbusServer.on('initialized', () => {
    log("info", "system", `✅ [E3DC-Modbus] E3DC S10 Mock läuft auf ${HOST}:${E3DC_MODBUS_PORT}`);
    log("info", "system", `   Register 40067-40083 (Holding Registers) verfügbar`);
  });

  log("info", "system", "\n📋 Demo-Modus Konfiguration:");
  log("info", "system", "   1. Wallbox IP: 127.0.0.1 (UDP Port 7090)");
  log("info", "system", "   2. E3DC IP: 127.0.0.1:5502 (Modbus TCP)");
  log("info", "system", "   3. FHEM Base-URL: http://127.0.0.1:8083/fhem");
  log("info", "system", "   4. Demo-Modus in Einstellungen aktivieren\n");

  log("info", "system", "🔄 State-Synchronisation aktiv:");
  log("info", "system", "   - Wallbox-Leistung → E3DC Grid-Berechnung");
  log("info", "system", "   - PV-Überschuss → Battery Charging/Discharging");
  log("info", "system", "   - FHEM Device States (autoWallboxPV, etc.)");
  log("info", "system", "   - Realistische Tageszeit-Simulation\n");
  
  // =============================================================================
  // UDP BROADCASTS (wie echte KEBA Wallbox)
  // =============================================================================
  
  // Broadcast-Callback ist bereits in startUnifiedMock() gesetzt
  // (verwendet wallboxUdpChannel.sendBroadcast)
  
  // Timer für periodische E pres Broadcasts (alle 3 Sekunden während des Ladens)
  broadcastTimer = setInterval(() => {
    const report2 = wallboxMockService.getReport2();
    const isCharging = report2.State === 3; // State 3 = Charging
    
    if (isCharging) {
      const ePres = wallboxMockService.getEPres();
      const broadcastData = { "E pres": ePres };
      
      log("debug", "system", `[Mock-Wallbox → Broadcast] E pres (während Ladung): ${JSON.stringify(broadcastData)}`);
      
      // Broadcast über UDP-Channel senden
      wallboxUdpChannel.sendBroadcast(broadcastData);
    }
  }, 3000); // Alle 3 Sekunden
  
  log("info", "system", "📡 UDP Broadcasts aktiviert:");
  log("info", "system", "   - E pres alle 3s (während Ladung)");
  log("info", "system", "   - Input/State/Plug bei Änderungen\n");
  
  isRunning = true;
}

export async function stopUnifiedMock(): Promise<void> {
  if (!isRunning) {
    return;
  }
  
  log("info", "system", "\n🛑 [Unified-Mock] Server wird heruntergefahren...");
  
  // Broadcast-Timer stoppen
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
    log("info", "system", "   ✅ Broadcast-Timer gestoppt");
  }
  
  // Broadcast-Callback entfernen (verhindert doppelte Callbacks bei Restart)
  wallboxMockService.setBroadcastCallback(() => {});
  log("info", "system", "   ✅ Broadcast-Callback entfernt");
  
  // UDP Channel Handler deregistrieren
  wallboxUdpChannel.offCommand(handleWallboxCommand);
  wallboxUdpChannel.offBroadcast(handleWallboxBroadcast);
  
  const promises: Promise<void>[] = [
    wallboxUdpChannel.stop(),
    new Promise<void>((resolve) => {
      fhemServer.close(() => {
        log("info", "system", "   ✅ FHEM HTTP Server gestoppt");
        resolve();
      });
    })
  ];
  
  // Modbus Server nur stoppen wenn er existiert (wurde bei startUnifiedMock erstellt)
  if (modbusServer) {
    promises.push(
      new Promise<void>((resolve) => {
        modbusServer.close(() => {
          log("info", "system", "   ✅ E3DC Modbus Server gestoppt");
          modbusServer = null;
          resolve();
        });
      })
    );
  }
  
  await Promise.all(promises);
  
  isRunning = false;
}

// Hinweis: Auto-Start wurde entfernt - Mock wird nur via startUnifiedMock() gestartet
// Wenn direkt ausgeführt werden soll: tsx server/unified-mock.ts
// Dann manuell startUnifiedMock() aufrufen

// Export für programmatischen Zugriff
export { wallboxMockService, e3dcMockService };
