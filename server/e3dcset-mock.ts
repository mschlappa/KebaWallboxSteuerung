#!/usr/bin/env node
/**
 * Mock e3dcset CLI Tool für Demo-Modus
 * 
 * Simuliert das echte e3dcset-Tool von https://github.com/mschlappa/e3dcset
 * Schreibt Befehle in State-Datei statt an echtes E3DC zu senden.
 * 
 * Verwendung (gleich wie echtes e3dcset):
 *   e3dcset-mock -s discharge 0      # Entladesperre aktivieren
 *   e3dcset-mock -s discharge 1      # Entladesperre deaktivieren
 *   e3dcset-mock -s charge 1 -c 2500 # Netzladen mit 2500W aktivieren
 *   e3dcset-mock -s charge 0         # Netzladen deaktivieren
 */

import fs from 'fs/promises';
import path from 'path';

interface E3dcControlState {
  maxDischargePower: number;   // Maximale Entladeleistung in Watt (1W = gesperrt, 3000W = normal)
  gridCharging: boolean;       // true = Netzladen aktiv
  gridChargePower: number;     // Ladeleistung in Watt
  lastCommand: string;         // Letzter Befehl für Debug
  lastCommandTime: string;     // Zeitstempel des letzten Befehls
}

const STATE_FILE = path.join(process.cwd(), 'data', 'e3dc-control-state.json');

async function loadState(): Promise<E3dcControlState> {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    // Default State wenn Datei nicht existiert
    return {
      maxDischargePower: 3000, // Default: volle Entladung
      gridCharging: false,
      gridChargePower: 0,
      lastCommand: '',
      lastCommandTime: new Date().toISOString(),
    };
  }
}

async function saveState(state: E3dcControlState): Promise<void> {
  // Sicherstellen dass data/ Verzeichnis existiert
  const dataDir = path.dirname(STATE_FILE);
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch {
    // Verzeichnis existiert bereits
  }
  
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: e3dcset-mock [-d <watts>] [-a] [-c <watts>] [-e <watts>]');
    process.exit(1);
  }
  
  const state = await loadState();
  let commandStr = 'e3dcset';
  
  // Parse Argumente (gleich wie echtes e3dcset)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    commandStr += ` ${arg}`;
    
    if (arg === '-d' && i + 1 < args.length) {
      // -d <watts>: Maximale Entladeleistung setzen
      const dischargePower = parseInt(args[i + 1], 10);
      state.maxDischargePower = dischargePower;
      console.log(`[E3DC Mock] Maximale Entladeleistung gesetzt auf ${dischargePower}W`);
      i += 1;
    } else if (arg === '-a') {
      // -a: Zurück auf Automatik/Default (3000W Entladung)
      state.maxDischargePower = 3000;
      state.gridCharging = false;
      state.gridChargePower = 0;
      console.log('[E3DC Mock] Zurück auf Automatik: Entladung 3000W, Netzladen aus');
    } else if (arg === '-c' && i + 1 < args.length) {
      // -c <watts>: Netzladen mit bestimmter Leistung
      const chargePower = parseInt(args[i + 1], 10);
      state.gridCharging = true;
      state.gridChargePower = chargePower;
      console.log(`[E3DC Mock] Netzladen aktiviert mit ${chargePower}W`);
      i += 1;
    } else if (arg === '-e' && i + 1 < args.length) {
      // -e <watts>: Netzladen deaktivieren wenn 0
      const enablePower = parseInt(args[i + 1], 10);
      if (enablePower === 0) {
        state.gridCharging = false;
        state.gridChargePower = 0;
        console.log('[E3DC Mock] Netzladen deaktiviert');
      }
      i += 1;
    }
  }
  
  // State speichern
  state.lastCommand = commandStr.trim();
  state.lastCommandTime = new Date().toISOString();
  await saveState(state);
  
  // Erfolg (wie echtes e3dcset)
  process.exit(0);
}

main().catch((error) => {
  console.error('[E3DC Mock] Error:', error.message);
  process.exit(1);
});
