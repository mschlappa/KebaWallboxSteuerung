import ModbusRTU from "modbus-serial";
import type { E3dcLiveData } from "@shared/schema";

/**
 * E3DC S10 Modbus TCP Register Mapping (Simple Mode)
 * 
 * Quelle: Offizielle E3DC Modbus/TCP-Schnittstelle Dokumentation
 * Alle Leistungswerte sind INT32 (2 Register).
 * 
 * WICHTIG: modbus-serial nutzt 0-basierte Offsets, nicht die Holding-Register-Nummern.
 * Holding Register 40068 → Offset 67 (40068 - 40001 = 67)
 * 
 * HINWEIS: Wallbox-Leistung wird NICHT aus E3DC gelesen, sondern immer von KEBA UDP Report 3
 */
const E3DC_REGISTERS = {
  PV_POWER: 67,              // Holding Register 40068, INT32, Watt
  BATTERY_POWER: 69,         // Holding Register 40070, INT32, Watt (negativ = Entladung)
  HOUSE_POWER: 71,           // Holding Register 40072, INT32, Watt
  GRID_POWER: 73,            // Holding Register 40074, INT32, Watt (negativ = Einspeisung)
  AUTARKY_SELFCONS: 81,      // Holding Register 40082, UINT16, High Byte = Autarkie %, Low Byte = Eigenverbrauch %
  BATTERY_SOC: 82,           // Holding Register 40083, UINT16, Prozent
} as const;

const MODBUS_PORT = 502;
const MODBUS_TIMEOUT = 5000; // 5 Sekunden Timeout

/**
 * E3DC Modbus Service
 * 
 * Stellt Verbindung zum E3DC S10 über Modbus TCP her und liest Live-Daten aus.
 */
export class E3dcModbusService {
  private client: ModbusRTU;
  private isConnected: boolean = false;
  private lastError: string | null = null;

  constructor() {
    this.client = new ModbusRTU();
    this.client.setTimeout(MODBUS_TIMEOUT);
  }

  /**
   * Verbindung zum E3DC S10 herstellen (oder wiederherstellen)
   */
  async connect(ipAddress: string): Promise<void> {
    // Wenn bereits verbunden, keine neue Connection aufbauen
    if (this.isConnected) {
      return;
    }

    try {
      // Schließe alte Connection falls vorhanden (z.B. nach Fehler)
      try {
        this.client.close(() => {});
      } catch {
        // Ignoriere Fehler beim Schließen
      }

      // Neue Connection aufbauen
      await this.client.connectTCP(ipAddress, { port: MODBUS_PORT });
      this.client.setID(1); // Modbus Unit ID (Standard: 1)
      this.isConnected = true;
      this.lastError = null;
      console.log(`[E3DC Modbus] Verbindung zu ${ipAddress}:${MODBUS_PORT} hergestellt`);
    } catch (error) {
      this.isConnected = false;
      this.lastError = error instanceof Error ? error.message : "Unbekannter Fehler";
      console.error(`[E3DC Modbus] Verbindungsfehler: ${this.lastError}`);
      throw new Error(`E3DC Modbus-Verbindung fehlgeschlagen: ${this.lastError}`);
    }
  }

  /**
   * Verbindung trennen
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      this.client.close(() => {
        console.log("[E3DC Modbus] Verbindung getrennt");
      });
      this.isConnected = false;
    }
  }

  /**
   * INT32-Wert aus 2 Modbus-Registern lesen (Big-Endian)
   */
  private async readInt32(registerAddress: number): Promise<number> {
    try {
      const data = await this.client.readHoldingRegisters(registerAddress, 2);
      const high = data.data[0];
      const low = data.data[1];
      
      // DEBUG: RAW-Register-Werte ausgeben
      console.log(`[E3DC Modbus DEBUG] Register ${registerAddress}: high=${high} (0x${high.toString(16)}), low=${low} (0x${low.toString(16)})`);
      
      // INT32 aus 2x UINT16 zusammensetzen (Big-Endian)
      const uint32 = (high << 16) | low;
      
      // Konvertierung zu INT32 (Zweier-Komplement)
      return uint32 > 0x7FFFFFFF ? uint32 - 0x100000000 : uint32;
    } catch (error) {
      // Bei Lese-Fehler: Connection als ungültig markieren
      this.isConnected = false;
      this.client.close(() => {});
      throw error;
    }
  }

  /**
   * UINT16-Wert aus 1 Modbus-Register lesen
   */
  private async readUint16(registerAddress: number): Promise<number> {
    try {
      const data = await this.client.readHoldingRegisters(registerAddress, 1);
      
      // DEBUG: RAW-Register-Wert ausgeben
      console.log(`[E3DC Modbus DEBUG] Register ${registerAddress}: value=${data.data[0]} (0x${data.data[0].toString(16)})`);
      
      return data.data[0];
    } catch (error) {
      // Bei Lese-Fehler: Connection als ungültig markieren
      this.isConnected = false;
      this.client.close(() => {});
      throw error;
    }
  }

  /**
   * Live-Daten vom E3DC S10 abrufen
   * 
   * @param kebaWallboxPower - Wallbox-Leistung von KEBA UDP Report 3 (immer verwendet, da E3DC keine Wallbox hat)
   */
  async readLiveData(kebaWallboxPower: number = 0): Promise<E3dcLiveData> {
    // Keine explizite Connection-Prüfung - wenn nicht connected, 
    // werden die readInt32/readUint16 Methoden einen Fehler werfen

    try {
      // Alle E3DC Register parallel auslesen (OHNE Wallbox - die kommt von KEBA)
      const [pvPower, batteryPower, housePower, gridPower, autarkySelfCons, batterySoc] = await Promise.all([
        this.readInt32(E3DC_REGISTERS.PV_POWER),
        this.readInt32(E3DC_REGISTERS.BATTERY_POWER),
        this.readInt32(E3DC_REGISTERS.HOUSE_POWER),
        this.readInt32(E3DC_REGISTERS.GRID_POWER),
        this.readUint16(E3DC_REGISTERS.AUTARKY_SELFCONS),
        this.readUint16(E3DC_REGISTERS.BATTERY_SOC),
      ]);

      // Register 40082: Autarkie (High Byte) & Eigenverbrauch (Low Byte)
      const autarky = (autarkySelfCons >> 8) & 0xFF;
      const selfConsumption = autarkySelfCons & 0xFF;

      // DEBUG: RAW-Werte ausgeben
      console.log(`[E3DC Modbus DEBUG] RAW-Werte:
        PV: ${pvPower} W
        Batterie: ${batteryPower} W
        Haus: ${housePower} W
        Netz: ${gridPower} W
        Batterie SOC: ${batterySoc}%
        Autarkie/Eigenverbrauch Register: ${autarkySelfCons} (0x${autarkySelfCons.toString(16)})
        Autarkie: ${autarky}%
        Eigenverbrauch: ${selfConsumption}%
        Wallbox (KEBA UDP): ${kebaWallboxPower} W`);

      return {
        pvPower,
        batteryPower,
        batterySoc,
        housePower,
        gridPower,
        wallboxPower: kebaWallboxPower,
        autarky,
        selfConsumption,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unbekannter Fehler";
      console.error(`[E3DC Modbus] Fehler beim Lesen der Register: ${this.lastError}`);
      throw new Error(`E3DC Modbus-Lesefehler: ${this.lastError}`);
    }
  }

  /**
   * Verbindungsstatus prüfen
   */
  getConnectionStatus(): { connected: boolean; lastError: string | null } {
    return {
      connected: this.isConnected,
      lastError: this.lastError,
    };
  }
}

// Singleton-Instanz für die gesamte Anwendung
let e3dcService: E3dcModbusService | null = null;

/**
 * E3DC Modbus Service-Instanz abrufen (Singleton)
 */
export function getE3dcModbusService(): E3dcModbusService {
  if (!e3dcService) {
    e3dcService = new E3dcModbusService();
  }
  return e3dcService;
}
