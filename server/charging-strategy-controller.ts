import type { ChargingStrategy, ChargingStrategyConfig, ChargingContext, E3dcLiveData } from "@shared/schema";
import { storage } from "./storage";
import { log } from "./logger";
import { e3dcClient } from "./e3dc-client";

const PHASE_VOLTAGE_1P = 230;
const MIN_CURRENT_AMPERE = 6;
const MAX_CURRENT_1P_AMPERE = 32;
const MAX_CURRENT_3P_AMPERE = 16;

export class ChargingStrategyController {
  private sendUdpCommand: (ip: string, command: string) => Promise<any>;
  private lastE3dcData: E3dcLiveData | null = null;
  private batteryDischargeSince: Date | null = null;
  
  constructor(sendUdpCommand: (ip: string, command: string) => Promise<any>) {
    this.sendUdpCommand = sendUdpCommand;
  }

  /**
   * Behandelt Strategie-Wechsel und aktiviert/deaktiviert Battery Lock
   * 
   * WICHTIG: Muss nach jedem Strategie-Wechsel aufgerufen werden!
   * - "Max Power without Battery" → Battery Lock aktivieren
   * - Alle anderen Strategien → Battery Lock deaktivieren
   */
  async handleStrategyChange(newStrategy: ChargingStrategy): Promise<void> {
    const settings = storage.getSettings();
    
    // Prüfe ob E3DC konfiguriert ist
    if (!settings?.e3dc?.enabled) {
      log('info', 'system', 'E3DC nicht aktiviert - Battery Lock Steuerung übersprungen');
      return;
    }

    // Prüfe ob e3dcClient konfiguriert wurde (wichtig!)
    if (!e3dcClient.isConfigured()) {
      log('warning', 'system', 'E3DC Client nicht konfiguriert - rufe configure() auf');
      try {
        e3dcClient.configure(settings.e3dc);
      } catch (error) {
        log('error', 'system', 'E3DC Client konnte nicht konfiguriert werden', error instanceof Error ? error.message : String(error));
        return;
      }
    }

    // Battery Lock nur für "Max Power without Battery" aktivieren
    if (newStrategy === "max_without_battery") {
      try {
        log('info', 'system', 'Strategie-Wechsel: Max Power ohne Batterie → Battery Lock aktivieren');
        await e3dcClient.lockDischarge();
        
        // Control State aktualisieren (für Konsistenz mit UI)
        const controlState = storage.getControlState();
        storage.saveControlState({ ...controlState, batteryLock: true });
      } catch (error) {
        log('error', 'system', 'Fehler beim Aktivieren der Entladesperre', error instanceof Error ? error.message : String(error));
        throw error;
      }
    } else if (newStrategy === "off" || newStrategy === "surplus_battery_prio" || 
               newStrategy === "surplus_vehicle_prio" || newStrategy === "max_with_battery") {
      try {
        log('info', 'system', `Strategie-Wechsel: ${newStrategy} → Battery Lock deaktivieren`);
        await e3dcClient.unlockDischarge();
        
        // Control State aktualisieren (für Konsistenz mit UI)
        const controlState = storage.getControlState();
        storage.saveControlState({ ...controlState, batteryLock: false });
      } catch (error) {
        log('error', 'system', 'Fehler beim Deaktivieren der Entladesperre', error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
  }

  async processStrategy(liveData: E3dcLiveData, wallboxIp: string): Promise<void> {
    this.lastE3dcData = liveData;
    
    const settings = storage.getSettings();
    if (!settings?.chargingStrategy) {
      return;
    }
    
    const config = settings.chargingStrategy;
    
    // KRITISCH: Context mit echtem Wallbox-Status abgleichen
    await this.reconcileChargingContext(wallboxIp);
    
    const context = storage.getChargingContext();
    
    if (config.activeStrategy === "off") {
      // Context auf "off" aktualisieren, damit Frontend richtig anzeigt
      if (context.strategy !== "off") {
        storage.updateChargingContext({ strategy: "off" });
      }
      if (context.isActive) {
        await this.stopCharging(wallboxIp);
      }
      return;
    }
    
    // Context-Strategie mit Config synchronisieren
    if (context.strategy !== config.activeStrategy) {
      storage.updateChargingContext({ strategy: config.activeStrategy });
    }
    
    const surplus = this.calculateSurplus(config.activeStrategy, liveData);
    storage.updateChargingContext({ calculatedSurplus: surplus });
    
    log("debug", "system", `Strategy: ${config.activeStrategy}, isActive: ${context.isActive}, surplus: ${surplus}W`);
    
    if (this.shouldStopCharging(config, surplus, liveData)) {
      log("debug", "system", `shouldStopCharging = true → stopCharging`);
      await this.stopCharging(wallboxIp);
      return;
    }
    
    const result = this.calculateTargetCurrent(config, surplus, liveData);
    const currentPhases = context.currentPhases;
    log("debug", "system", `calculateTargetCurrent result: ${result ? `${result.currentMa}mA @ ${currentPhases}P` : 'null'}`);
    
    if (result === null) {
      if (context.isActive) {
        // WÄHREND aktiver Ladung: null bedeutet "zu wenig Überschuss"
        // → Lass shouldStopCharging() mit Hysterese entscheiden!
        // NICHT sofort stoppen, sondern warte auf Hysterese-Timer
        log("debug", "system", `result=null && isActive → Überschuss zu gering, aber shouldStopCharging() prüft bereits mit Hysterese`);
      }
      return;
    }
    
    if (!context.isActive) {
      log("debug", "system", `!isActive → prüfe shouldStartCharging`);
      if (this.shouldStartCharging(config, surplus)) {
        log("debug", "system", `shouldStartCharging = true → startCharging mit ${result.currentMa}mA @ ${currentPhases}P`);
        await this.startCharging(wallboxIp, result.currentMa, config);
      } else {
        log("debug", "system", `shouldStartCharging = false → warte noch`);
      }
    } else {
      log("debug", "system", `isActive → adjustCurrent mit ${result.currentMa}mA @ ${currentPhases}P`);
      await this.adjustCurrent(wallboxIp, result.currentMa, config);
    }
  }

  private calculateSurplus(strategy: ChargingStrategy, liveData: E3dcLiveData): number {
    // WICHTIG: E3DC liefert housePower MIT Wallbox-Anteil!
    // Für korrekte Überschuss-Berechnung muss Wallbox-Leistung abgezogen werden
    const housePowerWithoutWallbox = liveData.housePower - liveData.wallboxPower;
    
    switch (strategy) {
      case "surplus_battery_prio":
        // Batterie-Priorisierung: HAUSBATTERIE wird bevorzugt geladen
        // Wallbox bekommt nur, was NACH der Batterie-Ladung übrig bleibt
        // Formel: (PV - Haus) - Batterie-Aufnahme
        // batteryPower: positiv = Batterie lädt, negativ = Batterie entlädt
        const totalSurplus = liveData.pvPower - housePowerWithoutWallbox;
        const batteryConsumption = Math.max(0, liveData.batteryPower); // Nur wenn Batterie lädt
        const surplusAfterBattery = totalSurplus - batteryConsumption;
        const surplusWithMargin = surplusAfterBattery * 0.90; // 10% Sicherheitsmarge
        
        log("debug", "system", 
          `[surplus_battery_prio] PV=${liveData.pvPower}W, Haus(ohne WB)=${housePowerWithoutWallbox}W, ` +
          `Batterie=${liveData.batteryPower}W, Total-Überschuss=${totalSurplus}W, ` +
          `Nach Batterie=${surplusAfterBattery}W, Mit Marge=${Math.round(surplusWithMargin)}W`
        );
        
        return Math.max(0, surplusWithMargin);
      
      case "surplus_vehicle_prio": {
        const rawSurplus = liveData.pvPower - housePowerWithoutWallbox + Math.min(0, liveData.batteryPower);
        const surplus = Math.max(0, rawSurplus);
        
        if (rawSurplus !== surplus) {
          log("debug", "system", 
            `Surplus-Komponenten: PV=${liveData.pvPower}W, Haus=${liveData.housePower}W (ohne WB: ${housePowerWithoutWallbox}W), Batterie=${liveData.batteryPower}W → Raw=${rawSurplus}W → Final=${surplus}W`
          );
        }
        
        return surplus;
      }
      
      case "max_with_battery":
        // Maximale Leistung MIT Batterie: PV + Batterie-Discharge - Hausverbrauch (ohne Wallbox!)
        // batteryPower ist positiv wenn die Batterie lädt, negativ wenn sie entlädt
        // Für max Wallbox-Leistung nutzen wir Batterie-Entladung (abs)
        return Math.max(0, liveData.pvPower + Math.abs(Math.min(0, liveData.batteryPower)) - housePowerWithoutWallbox);
      
      case "max_without_battery":
        // Maximale Leistung OHNE Batterie: Nur PV - Hausverbrauch (ohne Wallbox!)
        return Math.max(0, liveData.pvPower - housePowerWithoutWallbox);
      
      default:
        return 0;
    }
  }

  private calculateTargetCurrent(
    config: ChargingStrategyConfig, 
    surplus: number,
    liveData: E3dcLiveData
  ): { currentMa: number } | null {
    const strategy = config.activeStrategy;
    const context = storage.getChargingContext();
    const settings = storage.getSettings();
    
    // WICHTIG: Phase-Logik
    // 1. Wenn NICHT aktiv:
    //    - Im Demo-Modus: nutze mockWallboxPhases (simulierte Wallbox-Konfiguration)
    //    - Im Produktiv-Modus: nutze physicalPhaseSwitch (User sagt wo der Schalter steht, Default 3P)
    // 2. Wenn aktiv → nutze context.currentPhases (echte erkannte Phasen aus Strömen)
    const currentPhases = context.isActive 
      ? context.currentPhases 
      : (settings?.demoMode ? (settings.mockWallboxPhases ?? 3) : (config.physicalPhaseSwitch ?? 3));
    
    // Max Power Strategien: Immer maximaler Strom
    const isMaxPowerStrategy = strategy === "max_with_battery" || strategy === "max_without_battery";
    
    if (isMaxPowerStrategy) {
      const maxCurrent = currentPhases === 1 ? MAX_CURRENT_1P_AMPERE : MAX_CURRENT_3P_AMPERE;
      return { currentMa: maxCurrent * 1000 };
    }
    
    // Surplus-Strategien: Prüfe ob genug Leistung für Mindest-Strom
    const minPower = MIN_CURRENT_AMPERE * PHASE_VOLTAGE_1P * currentPhases;
    if (surplus < minPower) {
      return null;
    }
    
    const maxCurrent = currentPhases === 1 ? MAX_CURRENT_1P_AMPERE : MAX_CURRENT_3P_AMPERE;
    
    let currentAmpere = Math.round(surplus / (PHASE_VOLTAGE_1P * currentPhases));
    currentAmpere = Math.max(MIN_CURRENT_AMPERE, Math.min(maxCurrent, currentAmpere));
    
    if (strategy === "surplus_vehicle_prio") {
      currentAmpere = this.applyBatteryProtection(currentAmpere, liveData);
    }
    
    return { currentMa: currentAmpere * 1000 };
  }


  private applyBatteryProtection(currentAmpere: number, liveData: E3dcLiveData): number {
    const DISCHARGE_THRESHOLD = -500;
    const DISCHARGE_DURATION_THRESHOLD = 120000;
    
    if (liveData.batteryPower < DISCHARGE_THRESHOLD) {
      if (!this.batteryDischargeSince) {
        this.batteryDischargeSince = new Date();
      }
      
      const dischargeDuration = Date.now() - this.batteryDischargeSince.getTime();
      
      if (dischargeDuration > DISCHARGE_DURATION_THRESHOLD) {
        const reductionAmpere = 2;
        log("info", "system", 
          `Strategie 2: Batterie-Entladung seit ${Math.floor(dischargeDuration / 1000)}s - Reduziere Ladestrom um ${reductionAmpere}A`,
          `Batterie-Leistung: ${liveData.batteryPower}W`
        );
        return Math.max(MIN_CURRENT_AMPERE, currentAmpere - reductionAmpere);
      }
    } else {
      this.batteryDischargeSince = null;
    }
    
    return currentAmpere;
  }

  private shouldStartCharging(config: ChargingStrategyConfig, surplus: number): boolean {
    const context = storage.getChargingContext();
    const now = new Date();
    const strategy = config.activeStrategy;
    
    log("debug", "system", `shouldStartCharging: strategy=${strategy}, surplus=${surplus}W`);
    
    // Max Power Strategien starten sofort ohne Delay
    if (strategy === "max_with_battery" || strategy === "max_without_battery") {
      log("debug", "system", `Max Power Strategie (${strategy}) → Sofortstart ohne Delay - return true`);
      return true;
    }
    
    // Surplus-Strategien verwenden Start-Delay
    if (surplus < config.minStartPowerWatt) {
      if (context.startDelayTrackerSince) {
        storage.updateChargingContext({
          startDelayTrackerSince: undefined,
        });
        log("debug", "system", "Start-Delay zurückgesetzt - Überschuss zu niedrig");
      }
      log("debug", "system", `surplus < minStartPowerWatt → return false`);
      return false;
    }
    
    if (!context.startDelayTrackerSince) {
      storage.updateChargingContext({
        startDelayTrackerSince: now.toISOString(),
      });
      log("debug", "system", 
        `Start-Delay gestartet: Überschuss ${surplus}W > ${config.minStartPowerWatt}W - warte ${config.startDelaySeconds}s`
      );
      return false;
    }
    
    const waitingSince = new Date(context.startDelayTrackerSince);
    const waitingDuration = (now.getTime() - waitingSince.getTime()) / 1000;
    
    if (waitingDuration >= config.startDelaySeconds) {
      log("info", "system", 
        `Start-Bedingung erfüllt: Überschuss ${surplus}W > ${config.minStartPowerWatt}W für ${waitingDuration}s`
      );
      storage.updateChargingContext({
        startDelayTrackerSince: undefined,
      });
      return true;
    }
    
    log("debug", "system", `Warte noch ${config.startDelaySeconds - waitingDuration}s`);
    return false;
  }

  /**
   * Gleicht den gespeicherten Charging Context mit dem echten Wallbox-Status ab.
   * Verhindert, dass veraltete Zustände (z.B. isActive=true aus alter Sitzung) zu Fehlverhalten führen.
   */
  private async reconcileChargingContext(wallboxIp: string): Promise<void> {
    try {
      const [report2, report3] = await Promise.all([
        this.sendUdpCommand(wallboxIp, "report 2"),
        this.sendUdpCommand(wallboxIp, "report 3"),
      ]);
      
      const context = storage.getChargingContext();
      const wallboxState = report2.State;  // 0=startup, 1=idle, 2=waiting, 3=charging, 4=error, 5=auth
      const wallboxPower = report3.P || 0;  // Leistung in mW
      const currents = [report3.I1 || 0, report3.I2 || 0, report3.I3 || 0];  // Ströme in mA
      
      // Wallbox lädt wirklich, wenn State=3 UND Power>0
      const reallyCharging = wallboxState === 3 && wallboxPower > 1000;  // >1W
      
      // Erkenne echte Phasen aus Strömen (>500mA als "aktiv" betrachten)
      const activePhases = currents.filter(i => i > 500).length;
      const detectedPhases = activePhases > 0 ? (activePhases === 1 ? 1 : 3) : 3;  // Default 3P
      
      // Korrigiere Context wenn nötig
      if (context.isActive && !reallyCharging) {
        log("info", "system", `[RECONCILE] Context sagt isActive=true, aber Wallbox lädt nicht (State=${wallboxState}, Power=${wallboxPower}mW) → setze isActive=false`);
        storage.updateChargingContext({
          isActive: false,
          currentAmpere: 0,
          targetAmpere: 0,
          currentPhases: detectedPhases,
        });
      } else if (!context.isActive && reallyCharging) {
        log("info", "system", `[RECONCILE] Context sagt isActive=false, aber Wallbox lädt (State=${wallboxState}, Power=${wallboxPower}mW) → setze isActive=true`);
        const avgCurrent = Math.round((currents[0] + currents[1] + currents[2]) / 1000 / (detectedPhases || 1));
        storage.updateChargingContext({
          isActive: true,
          currentAmpere: avgCurrent,
          targetAmpere: avgCurrent,
          currentPhases: detectedPhases,
        });
      } else if (context.currentPhases !== detectedPhases && reallyCharging) {
        log("info", "system", `[RECONCILE] Phasen-Korrektur: ${context.currentPhases}P → ${detectedPhases}P (gemessen aus Strömen)`);
        storage.updateChargingContext({
          currentPhases: detectedPhases,
        });
      }
    } catch (error) {
      log("warning", "system", "Fehler beim Abgleich des Charging Context", error instanceof Error ? error.message : String(error));
    }
  }

  private shouldStopCharging(config: ChargingStrategyConfig, surplus: number, liveData: E3dcLiveData): boolean {
    const strategy = config.activeStrategy;
    
    if (strategy === "max_with_battery" || strategy === "max_without_battery") {
      return false;
    }
    
    const context = storage.getChargingContext();
    
    if (!context.isActive) {
      return false;
    }
    
    const now = new Date();
    
    // WICHTIG: surplus_battery_prio & surplus_vehicle_prio berechnen den Überschuss bereits OHNE Wallbox
    // (aus E3DC-Daten, wo housePowerWithoutWallbox die Wallbox nicht enthält)
    // Daher: surplus direkt verwenden, KEINE Wallbox-Addition!
    const availableSurplus = surplus;
    
    if (availableSurplus < config.stopThresholdWatt) {
      if (!context.belowThresholdSince) {
        storage.updateChargingContext({
          belowThresholdSince: now.toISOString(),
        });
        log("info", "system", 
          `[${strategy}] Überschuss unter Schwellwert: ${Math.round(availableSurplus)}W < ${config.stopThresholdWatt}W - Stopp-Timer gestartet`
        );
        return false;
      }
      
      const belowSince = new Date(context.belowThresholdSince);
      const duration = (now.getTime() - belowSince.getTime()) / 1000;
      
      if (duration >= config.stopDelaySeconds) {
        log("info", "system", 
          `[${strategy}] Stopp-Bedingung erfüllt: Überschuss ${Math.round(availableSurplus)}W zu niedrig für ${Math.round(duration)}s (Schwellwert: ${config.stopThresholdWatt}W, Verzögerung: ${config.stopDelaySeconds}s)`
        );
        return true;
      } else {
        log("debug", "system", 
          `[${strategy}] Unter Schwellwert seit ${Math.round(duration)}s von ${config.stopDelaySeconds}s - warte noch ${Math.round(config.stopDelaySeconds - duration)}s`
        );
      }
    } else {
      if (context.belowThresholdSince) {
        log("info", "system", 
          `[${strategy}] Überschuss wieder ausreichend: ${Math.round(availableSurplus)}W >= ${config.stopThresholdWatt}W - Stopp-Timer zurückgesetzt`
        );
        storage.updateChargingContext({
          belowThresholdSince: undefined,
        });
      }
    }
    
    return false;
  }

  private async startCharging(wallboxIp: string, targetCurrentMa: number, config: ChargingStrategyConfig): Promise<void> {
    try {
      const context = storage.getChargingContext();
      const settings = storage.getSettings();
      // Für START:
      // - Im Demo-Modus: nutze mockWallboxPhases
      // - Im Produktiv-Modus: nutze physicalPhaseSwitch (User-Konfiguration, Default 3P)
      const currentPhases = settings?.demoMode 
        ? (settings.mockWallboxPhases ?? 3) 
        : (config.physicalPhaseSwitch ?? 3);
      const finalAmpere = targetCurrentMa / 1000;
      
      await this.sendUdpCommand(wallboxIp, "ena 1");
      await this.sendUdpCommand(wallboxIp, `curr ${targetCurrentMa}`);
      
      const now = new Date();
      storage.updateChargingContext({
        isActive: true,
        currentAmpere: finalAmpere,
        targetAmpere: finalAmpere,
        strategy: config.activeStrategy,
        lastAdjustment: now.toISOString(),
        belowThresholdSince: undefined,
      });
      
      log("info", "system", 
        `Ladung gestartet mit ${finalAmpere}A @ ${currentPhases}P (Strategie: ${config.activeStrategy})`
      );
    } catch (error) {
      log("error", "system", 
        "Fehler beim Starten der Ladung",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async adjustCurrent(wallboxIp: string, targetCurrentMa: number, config: ChargingStrategyConfig): Promise<void> {
    const context = storage.getChargingContext();
    // Für ADJUST: nutze context.currentPhases (echte erkannte Phasen beim Laden)
    const currentPhases = context.currentPhases;
    const finalAmpere = targetCurrentMa / 1000;
    
    const currentDiffAmpere = Math.abs(finalAmpere - context.currentAmpere);
    
    if (currentDiffAmpere >= config.minCurrentChangeAmpere) {
      try {
        await this.sendUdpCommand(wallboxIp, `curr ${targetCurrentMa}`);
        
        const now = new Date();
        storage.updateChargingContext({
          currentAmpere: finalAmpere,
          targetAmpere: finalAmpere,
          lastAdjustment: now.toISOString(),
        });
        
        log("info", "system", 
          `Ladestrom angepasst: ${context.currentAmpere}A → ${finalAmpere}A @ ${currentPhases}P`
        );
      } catch (error) {
        log("error", "system", 
          "Fehler beim Anpassen des Ladestroms",
          error instanceof Error ? error.message : String(error)
        );
      }
    } else {
      storage.updateChargingContext({
        targetAmpere: finalAmpere,
      });
    }
  }

  private async stopCharging(wallboxIp: string): Promise<void> {
    const context = storage.getChargingContext();
    
    if (!context.isActive) {
      return;
    }
    
    try {
      // Nur "ena 0" senden - KEBA akzeptiert kein "curr 0" (Minimum ist 6A)
      await this.sendUdpCommand(wallboxIp, "ena 0");
      
      storage.updateChargingContext({
        isActive: false,
        currentAmpere: 0,
        targetAmpere: 0,
        belowThresholdSince: undefined,
        lastAdjustment: undefined,
      });
      
      this.batteryDischargeSince = null;
      
      log("info", "system", "Ladung gestoppt");
    } catch (error) {
      log("error", "system", 
        "Fehler beim Stoppen der Ladung",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async switchStrategy(newStrategy: ChargingStrategy, wallboxIp: string): Promise<void> {
    const context = storage.getChargingContext();
    const oldStrategy = context.strategy;
    
    if (oldStrategy === newStrategy) {
      log("debug", "system", `Strategie bereits aktiv: ${newStrategy}`);
      return;
    }
    
    log("info", "system", `Strategie-Wechsel: ${oldStrategy} → ${newStrategy}`);
    
    // Bei Strategie-Wechsel IMMER stoppen (falls aktiv), dann neu starten
    if (context.isActive) {
      await this.stopCharging(wallboxIp);
      log("info", "system", "Laufende Ladung gestoppt für Strategie-Wechsel");
    }
    
    if (oldStrategy === "max_without_battery") {
      await e3dcClient.unlockDischarge();
      log("info", "system", "E3DC Battery Lock entfernt (alte Strategie)");
    }
    
    if (newStrategy === "max_without_battery") {
      await e3dcClient.lockDischarge();
      log("info", "system", "E3DC Battery Lock aktiviert (neue Strategie)");
    }
    
    if (newStrategy === "max_with_battery" || newStrategy === "max_without_battery") {
      storage.updateChargingContext({
        strategy: newStrategy,
      });
      
      log("info", "system", `Max Power Strategie aktiviert - nächster Strategy Check startet Ladung`);
    } else if (newStrategy === "off") {
      storage.updateChargingContext({
        strategy: newStrategy,
      });
      log("info", "system", "Strategie auf 'off' gewechselt");
    } else {
      storage.updateChargingContext({
        strategy: newStrategy,
      });
      
      if (this.lastE3dcData) {
        await this.processStrategy(this.lastE3dcData, wallboxIp);
      }
    }
    
    this.batteryDischargeSince = null;
  }

  getStatus() {
    const context = storage.getChargingContext();
    const settings = storage.getSettings();
    
    return {
      ...context,
      config: settings?.chargingStrategy || null,
      batteryDischarging: this.batteryDischargeSince !== null,
      batteryDischargeDurationMs: this.batteryDischargeSince 
        ? Date.now() - this.batteryDischargeSince.getTime() 
        : 0,
    };
  }
}
