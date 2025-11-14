import type { E3dcLiveData } from "@shared/schema";
import fs from 'fs/promises';
import path from 'path';
import { log } from './logger';
import { storage } from './storage';

interface E3dcControlState {
  maxDischargePower: number;   // Maximale Entladeleistung in Watt (1W = gesperrt, 3000W = normal)
  gridCharging: boolean;       // true = Netzladen aktiv
  gridChargePower: number;     // Ladeleistung in Watt
  lastCommand: string;         // Letzter Befehl für Debug
  lastCommandTime: string;     // Zeitstempel des letzten Befehls
}

/**
 * Mock E3DC Service für UI-Entwicklung ohne echte Hardware
 * 
 * Generiert realistische, tageszeit-basierte Energiefluss-Daten:
 * - PV-Produktion folgt Sonnenstand (nachts 0W, mittags Peak)
 * - Batterie lädt/entlädt basierend auf tatsächlicher Leistung und Zeit
 * - Batterie-Kapazität: 10 kWh
 * - Grid Import/Export abhängig von PV vs. Verbrauch
 * - Wallbox-Leistung wird separat von KEBA gelesen
 * - Reagiert auf e3dcset-Mock-Befehle (Battery Lock, Grid Charging)
 */
export class E3dcMockService {
  private readonly BATTERY_CAPACITY_KWH = 10; // 10 kWh Hausbatterie
  private readonly MAX_BATTERY_POWER = 3000; // 3 kW Be-/Entladeleistung
  private readonly CONTROL_STATE_FILE = path.join(process.cwd(), 'data', 'e3dc-control-state.json');
  
  // State für dynamischen SOC
  private currentSoc: number = 50; // Start bei 50%
  private lastUpdateTime: number = Date.now();
  
  constructor() {
    // Initialer SOC basierend auf Tageszeit (Berliner Zeit)
    const { hour } = this.getBerlinTime();
    this.currentSoc = this.getInitialSocForTime(hour);
  }
  
  /**
   * Gibt die aktuelle Zeit in Europe/Berlin Zeitzone zurück
   * Im Demo-Modus kann eine fixe Tageszeit und Datum über Settings konfiguriert werden
   */
  private getBerlinTime(): { hour: number; minute: number; month: number } {
    const now = new Date();
    const berlinTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    
    // Prüfe ob Mock-Zeit aktiviert und gesetzt ist
    const settings = storage.getSettings();
    if (settings?.demoMode && settings?.mockTimeEnabled && settings?.mockDateTime) {
      // Parse mockDateTime (Format "YYYY-MM-DDTHH:MM")
      const mockDate = new Date(settings.mockDateTime);
      
      if (!isNaN(mockDate.getTime())) {
        return {
          hour: mockDate.getHours(),
          minute: mockDate.getMinutes(),
          month: mockDate.getMonth()
        };
      }
    }
    
    // Fallback: Echte Zeit verwenden
    return {
      hour: berlinTime.getHours(),
      minute: berlinTime.getMinutes(),
      month: berlinTime.getMonth()
    };
  }
  
  /**
   * Bestimmt initialen SOC basierend auf Uhrzeit
   */
  private getInitialSocForTime(hour: number): number {
    if (hour >= 6 && hour < 14) {
      // Morgens/Vormittags: steigend von 30% auf 80%
      return 30 + ((hour - 6) / 8) * 50;
    } else if (hour >= 14 && hour < 22) {
      // Nachmittags/Abends: fallend von 80% auf 40%
      return 80 - ((hour - 14) / 8) * 40;
    } else {
      // Nachts: niedrig
      return 30 + Math.random() * 10;
    }
  }

  /**
   * Lädt E3DC Control State aus Mock-Datei (von e3dcset-mock geschrieben)
   */
  private async loadControlState(): Promise<E3dcControlState> {
    try {
      const data = await fs.readFile(this.CONTROL_STATE_FILE, 'utf-8');
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

  /**
   * Generiert Mock E3DC Live-Daten basierend auf Tageszeit
   * 
   * ENERGIEBILANZ:
   * PV + Grid + Batterie-Entladung = Hausverbrauch + Wallbox + Batterie-Ladung
   * 
   * Mit Vorzeichen:
   * - Grid positiv = Netzbezug, negativ = Einspeisung
   * - Battery positiv = Ladung, negativ = Entladung
   * 
   * Formel: PV + Grid = House + Wallbox + BatteryPower
   * => Grid = House + Wallbox + BatteryPower - PV
   * 
   * ECHTER E3DC VERHALTENSWEISE:
   * - E3DC kennt Wallbox NICHT separat → zählt zum Hausverbrauch
   * - Batterie lädt IMMER mit max 3000W wenn Überschuss vorhanden (und SOC < 100%)
   * - Bei drohenendem Netzbezug: Batterieladung wird REDUZIERT um Grid auf 0W zu halten
   * - REAGIERT auf e3dcset-Mock-Befehle (dischargeLock, gridCharging)
   * 
   * @param wallboxPower - Aktuelle Wallbox-Leistung in Watt
   */
  async getLiveData(wallboxPower: number = 0): Promise<E3dcLiveData> {
    // Lade Control State aus Mock-Datei (von e3dcset-mock geschrieben)
    const controlState = await this.loadControlState();
    const maxDischargePower = controlState.maxDischargePower;
    const gridCharging = controlState.gridCharging;
    const gridChargePower = controlState.gridChargePower;
    const now = new Date();
    const { hour, minute } = this.getBerlinTime();
    const timeOfDay = hour + minute / 60; // Realistische Tageszeit

    // 1. PV-Produktion: Realistisch basierend auf Jahreszeit und Tageszeit
    const pvPower = this.calculatePvPower(timeOfDay);
    
    // 2. Hausverbrauch (ohne Wallbox): Realistisch basierend auf Tageszeit
    const housePowerWithoutWallbox = this.calculateHousePower(timeOfDay);
    
    // 3. Gesamtverbrauch = Haus + Wallbox (E3DC kennt keinen Unterschied!)
    const totalConsumption = housePowerWithoutWallbox + wallboxPower;
    
    // 4. Überschuss/Defizit berechnen
    const surplus = pvPower - totalConsumption;
    
    // 5. Batterie-Leistung berechnen - EXAKT WIE ECHTER E3DC!
    let batteryPower = 0;
    
    // Grid Charging aktiv → Batterie lädt mit konfigurierter Leistung (erzwingt Netzbezug!)
    if (gridCharging && this.currentSoc < 95) {
      batteryPower = gridChargePower;
    }
    // Normale Betriebslogik (wie echter E3DC)
    else if (surplus > 0) {
      // ÜBERSCHUSS: Batterie lädt mit min(3000W, verfügbarer Überschuss)
      // → Automatisch kein Netzbezug, da nur verfügbarer Überschuss genutzt wird
      if (this.currentSoc < 95) {
        batteryPower = Math.min(this.MAX_BATTERY_POWER, surplus);
      }
    } else if (surplus < 0) {
      // DEFIZIT: Batterie entlädt, ABER maximal mit maxDischargePower
      // maxDischargePower = 1W → quasi gesperrt (Battery Lock aktiv)
      // maxDischargePower = 3000W → normale Entladung (Battery Lock inaktiv)
      if (this.currentSoc > 10) {
        const actualMaxDischarge = Math.min(this.MAX_BATTERY_POWER, maxDischargePower);
        batteryPower = Math.max(-actualMaxDischarge, surplus);
      }
    }
    // Bei maxDischargePower = 1W: Entladen praktisch verhindert → Netzbezug unvermeidbar
    
    // 6. Grid-Leistung berechnen (Energiebilanz)
    // Grid = (House + Wallbox + BatteryCharge) - PV
    // Grid > 0 = Netzbezug (unvermeidbar wenn Defizit > 3000W oder batteryLock aktiv)
    // Grid < 0 = Einspeisung (wenn Überschuss > 3000W)
    const gridPower = totalConsumption + batteryPower - pvPower;
    
    // 8. SOC aktualisieren basierend auf Leistung und verstrichener Zeit
    const currentTime = Date.now();
    const elapsedHours = (currentTime - this.lastUpdateTime) / (1000 * 60 * 60); // ms zu Stunden
    
    // Energieänderung = Leistung (kW) × Zeit (h) = kWh
    const energyChangeKwh = (batteryPower / 1000) * elapsedHours;
    
    // SOC-Änderung = (Energieänderung / Kapazität) × 100
    const socChange = (energyChangeKwh / this.BATTERY_CAPACITY_KWH) * 100;
    
    // SOC aktualisieren und auf 0-100% begrenzen
    this.currentSoc = Math.max(0, Math.min(100, this.currentSoc + socChange));
    this.lastUpdateTime = currentTime;
    
    // 9. housePower für Frontend (mit Wallbox für E3DC-Display)
    const housePower = housePowerWithoutWallbox + wallboxPower;
    
    // DEBUG: Energiebilanz-Logging - ECHTER E3DC VERHALTENSWEISE
    log('debug', 'system', '[E3DC-Mock] Energiebilanz (wie echter E3DC)', JSON.stringify({
      housePowerWithoutWallbox: Math.round(housePowerWithoutWallbox),
      wallboxPower: Math.round(wallboxPower),
      totalConsumption: Math.round(totalConsumption),
      pvPower: Math.round(pvPower),
      surplus: Math.round(surplus),
      batteryPowerRequested: Math.round(surplus > 0 ? Math.min(3000, surplus) : 0),
      batteryPowerActual: Math.round(batteryPower),
      gridPower: Math.round(gridPower),
      formula: `${Math.round(totalConsumption)} + ${Math.round(batteryPower)} - ${Math.round(pvPower)} = ${Math.round(gridPower)}`
    }));
    
    // 9. Autarkie & Eigenverbrauch berechnen
    const { autarky, selfConsumption } = this.calculateEfficiency(pvPower, totalConsumption, gridPower);

    return {
      pvPower: Math.max(0, Math.round(pvPower)),
      batteryPower: Math.round(batteryPower),
      batterySoc: Math.round(this.currentSoc),
      housePower: Math.max(0, Math.round(housePower)),
      gridPower: Math.round(gridPower),
      wallboxPower,
      autarky: Math.round(autarky),
      selfConsumption: Math.round(selfConsumption),
      timestamp: now.toISOString(),
    };
  }

  /**
   * Berechnet PV-Leistung basierend auf Tageszeit (Gauss-Kurve)
   * Peak um 12 Uhr, nachts 0W
   * Berücksichtigt Jahreszeit (Sonnenzeiten und Peak-Leistung)
   * Verwendet Europe/Berlin Zeitzone
   */
  private calculatePvPower(timeOfDay: number): number {
    const { month } = this.getBerlinTime();
    
    // Jahreszeit-abhängige Parameter
    let sunriseHour: number;
    let sunsetHour: number;
    let maxPower: number;
    
    // Winter (November-Januar): Kurze Tage, niedrige Leistung
    if (month === 10 || month === 11 || month === 0) {
      sunriseHour = 7.5;   // ~7:30 Uhr
      sunsetHour = 16.5;   // ~16:30 Uhr
      maxPower = 3500;     // 3.5 kW Peak
    }
    // Übergang Winter→Frühling (Februar-März)
    else if (month === 1 || month === 2) {
      sunriseHour = 7.0;
      sunsetHour = 18.0;
      maxPower = 5000;     // 5 kW Peak
    }
    // Frühling/Frühsommer (April-Mai)
    else if (month === 3 || month === 4) {
      sunriseHour = 6.0;
      sunsetHour = 20.0;
      maxPower = 7000;     // 7 kW Peak
    }
    // Sommer (Juni-August)
    else if (month === 5 || month === 6 || month === 7) {
      sunriseHour = 5.0;
      sunsetHour = 21.0;
      maxPower = 8000;     // 8 kW Peak
    }
    // Herbst (September-Oktober)
    else {
      sunriseHour = 6.5;
      sunsetHour = 19.0;
      maxPower = 6000;     // 6 kW Peak
    }
    
    // Keine Produktion außerhalb Sonnenzeiten
    if (timeOfDay < sunriseHour || timeOfDay > sunsetHour) {
      return 0;
    }

    // Gauss-Kurve mit Peak bei 12 Uhr (Mittagszeit)
    const peak = 12;
    const width = 3.5; // Breite der Kurve - etwas schmaler für Winter
    
    const gaussian = Math.exp(-Math.pow(timeOfDay - peak, 2) / (2 * width * width));
    const basePower = maxPower * gaussian;
    
    // Leichte Variation ±10% für Wolken
    const variation = 1 + (Math.sin(Date.now() / 10000) * 0.1);
    
    return basePower * variation;
  }


  /**
   * Berechnet Hausverbrauch (ohne Wallbox)
   * Basis-Last + tageszeit-abhängige Variation
   * Typischer Haushalt: 400-600W Grundlast, Peaks beim Kochen/Fönen
   */
  private calculateHousePower(timeOfDay: number): number {
    let basePower = 400; // Grundlast
    
    // Morgens (7-9 Uhr): Erhöhter Verbrauch (Fönen, Frühstück)
    if (timeOfDay >= 7 && timeOfDay < 9) {
      basePower = 800 + Math.random() * 400; // 800-1200W
    }
    // Mittags (12-14 Uhr): Erhöhter Verbrauch (Kochen)
    else if (timeOfDay >= 12 && timeOfDay < 14) {
      basePower = 800 + Math.random() * 400; // 800-1200W
    }
    // Abends (18-20 Uhr): Erhöhter Verbrauch (Kochen, TV)
    else if (timeOfDay >= 18 && timeOfDay < 20) {
      basePower = 700 + Math.random() * 300; // 700-1000W
    }
    // Nachts (22-6 Uhr): Minimaler Verbrauch
    else if (timeOfDay >= 22 || timeOfDay < 6) {
      basePower = 300 + Math.random() * 200; // 300-500W
    }
    // Sonst: Normaler Verbrauch
    else {
      basePower = 400 + Math.random() * 200; // 400-600W
    }
    
    return basePower;
  }

  /**
   * Berechnet Autarkie und Eigenverbrauch in Prozent
   * 
   * Autarkie: Wie viel des Verbrauchs wird selbst erzeugt? (0-100%)
   * Eigenverbrauch: Wie viel der PV-Erzeugung wird selbst genutzt? (0-100%)
   */
  private calculateEfficiency(pvPower: number, totalConsumption: number, gridPower: number): {
    autarky: number;
    selfConsumption: number;
  } {
    // Autarkie: Anteil des selbst erzeugten Stroms am Gesamtverbrauch
    // 100% = kein Netzbezug, 0% = alles aus Netz
    let autarky = 0;
    if (totalConsumption > 0) {
      const gridImport = Math.max(0, gridPower); // Nur Bezug, keine Einspeisung
      const selfSupplied = totalConsumption - gridImport;
      autarky = Math.max(0, Math.min(100, (selfSupplied / totalConsumption) * 100));
    }
    
    // Eigenverbrauch: Anteil der selbst genutzten PV-Energie an Gesamt-PV
    // 100% = keine Einspeisung, 0% = alles eingespeist
    let selfConsumption = 0;
    if (pvPower > 0) {
      const gridExport = Math.abs(Math.min(0, gridPower)); // Nur Einspeisung
      const selfUsed = pvPower - gridExport;
      selfConsumption = Math.max(0, Math.min(100, (selfUsed / pvPower) * 100));
    }
    
    return { autarky, selfConsumption };
  }
}

// Singleton-Instanz
export const e3dcMockService = new E3dcMockService();
