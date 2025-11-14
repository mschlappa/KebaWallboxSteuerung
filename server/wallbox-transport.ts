/**
 * Wallbox UDP Transport Layer
 * 
 * Zentrales Modul für die UDP-Kommunikation mit der KEBA Wallbox.
 * Verwaltet Socket, Command-Queue und bietet Funktionen für synchrone und asynchrone UDP-Befehle.
 * 
 * Wird verwendet von:
 * - server/routes.ts (API-Endpoints)
 * - server/wallbox-broadcast-listener.ts (Input-Broadcast-Handler)
 * - server/charging-strategy-controller.ts (Ladesteuerung)
 */

import { createSocket, type Socket } from "dgram";
import { log } from "./logger";
import { storage } from "./storage";

const UDP_PORT = 7090;
const UDP_TIMEOUT = 6000;

// Globaler Socket für Wallbox-Kommunikation
let wallboxSocket: Socket | null = null;
let currentRequest: { command: string, resolve: (data: any) => void, reject: (error: Error) => void, timeout: NodeJS.Timeout } | null = null;
let commandQueue: Array<{ ip: string, command: string, resolve: (data: any) => void, reject: (error: Error) => void }> = [];

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
  // WICHTIG: parsed.ID ist eine Number (parseKebaResponse konvertiert numerische Werte)
  if (command === "report 1") {
    // Report 1 muss ID=1 und Product/Serial/Firmware enthalten
    return (parsed.ID === 1 || String(parsed.ID) === "1") && (parsed.Product || parsed.Serial || parsed.Firmware);
  }
  
  if (command === "report 2") {
    // Report 2 muss ID=2 und State/Plug/"Max curr" enthalten
    return (parsed.ID === 2 || String(parsed.ID) === "2") && (parsed.State !== undefined || parsed.Plug !== undefined || parsed["Max curr"] !== undefined);
  }
  
  if (command === "report 3") {
    // Report 3 muss ID=3 und U1/I1/P enthalten
    return (parsed.ID === 3 || String(parsed.ID) === "3") && (parsed.U1 !== undefined || parsed.I1 !== undefined || parsed.P !== undefined);
  }
  
  // Für ena/curr Befehle: Akzeptiere nur TCH-OK :done
  if (command.startsWith("ena") || command.startsWith("curr")) {
    const responseStr = JSON.stringify(parsed);
    return responseStr.includes("TCH-OK") || parsed["TCH-OK"] !== undefined;
  }
  
  // Für andere Befehle akzeptieren wir jede Antwort
  return true;
}

export function initWallboxSocket(): void {
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

  // Im Demo-Modus: Nutze ephemeral port (kein bind) um Port-Konflikt mit Mock-Server zu vermeiden
  // Im Production-Modus: Binde an Port 7090 für echte Wallbox-Kommunikation
  const isDemoMode = process.env.DEMO_AUTOSTART === 'true' || storage.getSettings()?.demoMode;
  
  if (isDemoMode) {
    // Kein bind() - UDP-Client nutzt ephemeral port vom OS
    log("info", "system", "Wallbox UDP-Client initialisiert (ephemeral port für Demo-Modus)");
  } else {
    // Binde an Port 7090 - notwendig damit echte Wallbox Antworten an diesen Port zurücksendet
    wallboxSocket.bind(UDP_PORT, () => {
      log("info", "system", `Wallbox UDP-Client initialisiert auf Port ${UDP_PORT}`);
    });
  }
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

/**
 * Sendet einen UDP-Befehl an die Wallbox und wartet auf Antwort.
 * Wird in die Command-Queue eingereiht um Race-Conditions zu vermeiden.
 */
export async function sendUdpCommand(ip: string, command: string): Promise<any> {
  initWallboxSocket();
  
  return new Promise((resolve, reject) => {
    commandQueue.push({ ip, command, resolve, reject });
    processCommandQueue();
  });
}

/**
 * Sendet einen Fire-and-Forget UDP-Befehl (ohne auf Antwort zu warten).
 * Wird für ena/curr-Befehle verwendet, die nur TCH-OK antworten.
 */
export async function sendUdpCommandNoResponse(ip: string, command: string): Promise<void> {
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
