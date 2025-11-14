/**
 * Mock KEBA Wallbox Service für UI-Entwicklung ohne echte Hardware
 * 
 * Simuliert KEBA P20/P30 UDP-Protokoll mit Reports 1/2/3:
 * - Report 1: Statische Geräteinfos (Product, Serial, Firmware)
 * - Report 2: Status (State, Plug, Enable sys, Max curr)
 * - Report 3: Leistungsdaten (P, U1-U3, I1-I3, E pres, E total)
 * 
 * Unterstützt Commands: ena 0/1, curr X
 */
export class WallboxMockService {
  // Static device info
  private readonly PRODUCT = "KC-P30-EC2401A2-M0R";
  private readonly SERIAL = "23000001";
  private readonly FIRMWARE = "P30 v 3.10.26 (231213-111518)";
  
  // State
  private enabled: boolean = false; // System aktiviert (standardmäßig AUS im Demo-Modus)
  private state: number = 2; // 0=Starting, 1=NotReady, 2=Ready, 3=Charging, 4=Error, 5=AuthReq
  private plug: number = 7; // 0=unplugged, 1=cable plugged in station, 3=cable plugged in EV, 5=locking, 7=locked
  private maxCurrent: number = 16000; // 16A in mA (3-phasig) oder 32000 mA (1-phasig)
  private currentSetpoint: number = 6000; // Aktueller Lade-Sollwert in mA
  private phases: number = 3; // 1=einphasig (PV-Überschuss), 3=dreiphasig (normal)
  private pvSurplusMode: boolean = false; // PV-Überschuss-Modus aktiv
  
  // Charging state
  private sessionEnergy: number = 0; // E pres in Wh
  private totalEnergy: number = 10000000; // E total in Wh (Startwert 10.000 kWh für Demo-Modus)
  private lastUpdateTime: number = Date.now();
  
  // Charging power tracking
  private currentPower: number = 0; // Aktuelle Ladeleistung in W
  private targetPower: number = 0; // Ziel-Ladeleistung in W
  
  constructor() {
    // Initialer Zustand: Kabel gesteckt, bereit zum Laden
    this.plug = 7;
    this.state = 2;
  }

  /**
   * Report 1: Statische Geräteinfos
   */
  getReport1(): any {
    return {
      "ID": "1",
      "Product": this.PRODUCT,
      "Serial": this.SERIAL,
      "Firmware": this.FIRMWARE,
      "COM-module": 1,
      "Backend": 0,
      "Sec": 6789 // Uptime in seconds (random)
    };
  }

  /**
   * Report 2: Status und Konfiguration
   */
  getReport2(): any {
    return {
      "ID": "2",
      "State": this.state,
      "Error1": 0,
      "Error2": 0,
      "Plug": this.plug,
      "AuthON": 0,
      "Authreq": 0,
      "Enable sys": this.enabled ? 1 : 0,
      "Enable user": 1,
      "Max curr": this.currentSetpoint, // Aktueller Sollstrom (vom Benutzer gesetzt)
      "Max curr %": 1000, // 100.0% (in 0.1%)
      "Curr HW": 16000, // Hardware limit 16A
      "Curr user": this.currentSetpoint, // Aktueller Sollstrom (vom Benutzer gesetzt)
      "Curr FS": 0,
      "Tmo FS": 0,
      "Curr timer": 0,
      "Tmo CT": 0,
      "Setenergy": 0,
      "Output": this.enabled ? 1 : 0,
      "Input": 0,
      "X2 phaseSwitch source": 4,
      "X2 phaseSwitch": 0,
      "Sec": 6789
    };
  }

  /**
   * Report 3: Leistungsdaten (1- oder 3-phasig)
   * 
   * Wichtig: Alle Werte in Millieinheiten (mV, mA, mW, mWh)
   */
  getReport3(): any {
    // Energie aktualisieren basierend auf verstrichener Zeit
    this.updateEnergyCounters();
    
    const phaseVoltage = 230000; // 230V in mV
    let i1 = 0, i2 = 0, i3 = 0;
    
    // Ströme nur anzeigen wenn Wallbox tatsächlich lädt (State 3 = Charging)
    if (this.state === 3 && this.enabled) {
      if (this.phases === 1) {
        // Einphasige Ladung: Nur Phase 1 hat Strom
        i1 = Math.round(this.currentSetpoint); // Sollstrom in mA
        i2 = 0;
        i3 = 0;
      } else {
        // Dreiphasige Ladung: Strom gleichmäßig verteilt
        const phaseCurrent = this.currentSetpoint; // Sollstrom pro Phase in mA
        i1 = Math.round(phaseCurrent);
        i2 = Math.round(phaseCurrent);
        i3 = Math.round(phaseCurrent);
      }
    }
    // Wenn nicht am Laden: Alle Ströme bleiben 0
    
    return {
      "ID": "3",
      "U1": phaseVoltage,
      "U2": phaseVoltage,
      "U3": phaseVoltage,
      "I1": i1,
      "I2": i2,
      "I3": i3,
      "P": Math.round(this.currentPower * 1000), // W → mW
      "PF": 990, // Power Factor 99.0%
      "E pres": Math.round(this.sessionEnergy), // in Wh
      "E total": Math.round(this.totalEnergy), // in Wh
      "Sec": 6789
    };
  }

  /**
   * Aktualisiert Energiezähler basierend auf aktueller Leistung und verstrichener Zeit
   */
  private updateEnergyCounters(): void {
    const now = Date.now();
    const elapsedHours = (now - this.lastUpdateTime) / (1000 * 60 * 60); // ms → h
    
    // Leistung graduell an Ziel-Leistung anpassen (Ramping)
    if (this.currentPower < this.targetPower) {
      // Leistung hochfahren: 1kW pro Sekunde
      const rampUpRate = 1000; // W/s
      const elapsedSeconds = (now - this.lastUpdateTime) / 1000;
      this.currentPower = Math.min(this.targetPower, this.currentPower + rampUpRate * elapsedSeconds);
    } else if (this.currentPower > this.targetPower) {
      // Leistung runterfahren: sofort
      this.currentPower = this.targetPower;
    }
    
    // Energie akkumulieren
    const energyWh = this.currentPower * elapsedHours;
    this.sessionEnergy += energyWh;
    this.totalEnergy += energyWh;
    
    this.lastUpdateTime = now;
  }

  /**
   * Führt Wallbox-Kommando aus
   * 
   * @param command z.B. "ena 1", "ena 0", "curr 16000"
   * @returns Response-Objekt wie echte KEBA Wallbox
   */
  executeCommand(command: string): any {
    const parts = command.toLowerCase().split(" ");
    const cmd = parts[0];
    const value = parts[1];

    if (cmd === "ena") {
      if (value === "1") {
        // Laden aktivieren
        this.enabled = true;
        if (this.plug === 7) { // Kabel gesteckt und verriegelt
          this.state = 3; // Charging
          this.calculateChargingPower();
        }
        return { "TCH-OK": "done" };
      } else if (value === "0") {
        // Laden deaktivieren
        this.enabled = false;
        this.state = 2; // Ready
        this.targetPower = 0;
        this.currentPower = 0;
        return { "TCH-OK": "done" };
      }
    }

    if (cmd === "curr") {
      // Stromstärke setzen (in mA)
      const newCurrent = parseInt(value);
      // KEBA P30 unterstützt 6-32A (6000-32000 mA)
      // 3-phasig: max 16A, 1-phasig: max 32A
      if (newCurrent >= 6000 && newCurrent <= 32000) {
        // Stromstärke auf max für aktuelle Phasenzahl begrenzen
        const maxForPhases = this.phases === 1 ? 32000 : 16000;
        this.currentSetpoint = Math.min(newCurrent, maxForPhases);
        
        if (this.state === 3) { // Wenn gerade lädt
          this.calculateChargingPower();
        }
        return { "TCH-OK": "done" };
      }
    }

    if (cmd === "phases") {
      // Phasenzahl manuell setzen (1 oder 3)
      const newPhases = parseInt(value);
      if (newPhases === 1 || newPhases === 3) {
        this.phases = newPhases;
        
        // Maximalstrom anpassen
        if (newPhases === 1) {
          this.maxCurrent = 32000; // 1P: max 32A
        } else {
          this.maxCurrent = 16000; // 3P: max 16A
        }
        
        // Stromstärke ggf. begrenzen
        if (this.currentSetpoint > this.maxCurrent) {
          this.currentSetpoint = this.maxCurrent;
        }
        
        // Leistung neu berechnen wenn gerade lädt
        if (this.state === 3) {
          this.calculateChargingPower();
        }
        
        return { "TCH-OK": "done" };
      }
    }

    if (cmd === "report") {
      const reportNum = value;
      if (reportNum === "1") return this.getReport1();
      if (reportNum === "2") return this.getReport2();
      if (reportNum === "3") return this.getReport3();
    }

    return { "TCH-ERR": "unknown command" };
  }

  /**
   * Berechnet Ladeleistung basierend auf aktuellem Sollstrom
   * 
   * 1-phasig (PV-Überschuss): P = U × I (6-32A @ 230V)
   * 3-phasig (Normal): P = √3 × U × I (6-16A @ 400V)
   */
  private calculateChargingPower(): void {
    if (!this.enabled || this.state !== 3) {
      this.targetPower = 0;
      return;
    }

    const currentAmps = this.currentSetpoint / 1000; // mA → A
    
    if (this.phases === 1) {
      // Einphasige Ladung (PV-Überschuss): P = U × I
      const voltage = 230; // V
      this.targetPower = voltage * currentAmps; // W
    } else {
      // Dreiphasige Ladung: P = √3 × U × I
      const voltage = 400; // Leiter-Leiter-Spannung
      const sqrt3 = Math.sqrt(3); // ≈ 1.732
      this.targetPower = sqrt3 * voltage * currentAmps; // W
    }
  }

  /**
   * Setzt Ladeleistung manuell (für PV-Überschuss-Steuerung)
   * Berechnet daraus den erforderlichen Strom
   * Verwendet automatisch einphasige Ladung bei PV-Überschuss
   */
  setChargingPower(powerW: number): void {
    let minPower: number;
    let maxPower: number;
    
    if (this.phases === 1) {
      // Einphasige Ladung: P = U × I
      const voltage = 230; // V
      minPower = voltage * 6; // 6A × 230V = 1380W
      maxPower = voltage * 32; // 32A × 230V = 7360W
    } else {
      // Dreiphasige Ladung: P = √3 × U × I
      const sqrt3 = Math.sqrt(3);
      const voltage = 400;
      minPower = sqrt3 * voltage * 6; // ~4157W
      maxPower = sqrt3 * voltage * 16; // ~11084W
    }

    // Leistung begrenzen
    const clampedPower = Math.max(0, Math.min(maxPower, powerW));

    if (clampedPower < minPower && clampedPower > 0) {
      // Unter Mindestleistung → auf Minimum setzen
      this.targetPower = minPower;
      this.currentSetpoint = 6000; // 6A
      
      // Reaktiviere Wallbox wenn Kabel gesteckt
      if (this.plug === 7) {
        this.enabled = true;
        this.state = 3; // Charging
      }
    } else if (clampedPower === 0) {
      // Komplett aus
      this.targetPower = 0;
      this.currentPower = 0;
      this.currentSetpoint = 0;
      this.state = 2; // Ready
      this.enabled = false;
    } else {
      // Strom berechnen basierend auf Phasenzahl
      let requiredCurrent: number;
      
      if (this.phases === 1) {
        // I = P / U
        requiredCurrent = clampedPower / 230; // A
      } else {
        // I = P / (√3 × U)
        const sqrt3 = Math.sqrt(3);
        requiredCurrent = clampedPower / (sqrt3 * 400); // A
      }
      
      this.currentSetpoint = Math.round(requiredCurrent * 1000); // → mA
      this.targetPower = clampedPower;
      
      // Reaktiviere Wallbox wenn Kabel gesteckt
      if (this.plug === 7) {
        this.enabled = true;
        this.state = 3; // Charging
      }
    }
  }

  /**
   * Liefert aktuelle Ladeleistung in Watt
   */
  getCurrentPower(): number {
    return Math.round(this.currentPower);
  }

  /**
   * Simuliert Kabelstecker-Event (für Testing)
   */
  plugCable(plugged: boolean): void {
    if (plugged) {
      this.plug = 7; // Locked
      this.state = 2; // Ready
    } else {
      this.plug = 0; // Unplugged
      this.state = 1; // Not Ready
      this.enabled = false;
      this.targetPower = 0;
      this.currentPower = 0;
    }
  }

  /**
   * Setzt Session-Energie zurück (neue Lade-Session)
   */
  resetSession(): void {
    this.sessionEnergy = 0;
  }

  /**
   * Setzt PV-Überschuss-Modus (schaltet auf einphasige Ladung um)
   */
  setPvSurplusMode(enabled: boolean): void {
    this.pvSurplusMode = enabled;
    
    if (enabled) {
      // PV-Überschuss: Einphasige Ladung (6-32A)
      this.phases = 1;
      this.maxCurrent = 32000; // 32A
    } else {
      // Normal: Dreiphasige Ladung (6-16A)
      this.phases = 3;
      this.maxCurrent = 16000; // 16A
    }
    
    // Wenn gerade geladen wird, Leistung neu berechnen
    if (this.state === 3) {
      this.calculateChargingPower();
    }
  }

  /**
   * Setzt die Phasen-Konfiguration der Mock-Wallbox (Demo-Modus)
   * Simuliert den physischen Phasen-Umschalter
   */
  setPhases(phases: 1 | 3): void {
    this.phases = phases;
    
    // Max Current anpassen
    if (phases === 1) {
      this.maxCurrent = 32000; // 32A einphasig
    } else {
      this.maxCurrent = 16000; // 16A dreiphasig
    }
    
    // Wenn gerade geladen wird, Leistung neu berechnen
    if (this.state === 3) {
      this.calculateChargingPower();
    }
  }

  /**
   * Initialisiert den Mock mit Demo-Startwerten
   */
  initializeDemo(): void {
    this.totalEnergy = 10000000; // 10.000 kWh
    this.sessionEnergy = 0;
    this.enabled = false;
    this.state = 2; // Ready
    this.plug = 7; // Locked
    this.currentSetpoint = 6000; // 6A
    this.currentPower = 0;
    this.targetPower = 0;
    this.phases = 3; // Dreiphasig als Standard
    this.maxCurrent = 16000; // 16A
    this.pvSurplusMode = false;
    this.lastUpdateTime = Date.now();
  }
}

// Singleton-Instanz
export const wallboxMockService = new WallboxMockService();
