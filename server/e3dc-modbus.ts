import ModbusRTU from "modbus-serial";
import type { E3dcLiveData } from "@shared/schema";

/**
 * E3DC S10 Modbus TCP Register Mapping
 * 
 * Die Register-Adressen basieren auf der E3DC S10 Modbus-Dokumentation.
 * Alle Leistungswerte sind INT32 (2 Register), SOC/Autarkie/Eigenverbrauch sind UINT16 (1 Register).
 * 
 * WICHTIG: modbus-serial nutzt 0-basierte Offsets, nicht die Holding-Register-Nummern.
 * Holding Register 40067 → Offset 66 (40067 - 40001 = 66)
 */
const E3DC_REGISTERS = {
  PV_POWER: 66,              // Holding Register 40067, INT32, Watt
  BATTERY_POWER: 68,         // Holding Register 40069, INT32, Watt (negativ = Entladung)
  HOUSE_POWER: 70,           // Holding Register 40071, INT32, Watt
  GRID_POWER: 72,            // Holding Register 40073, INT32, Watt (negativ = Einspeisung)
  BATTERY_SOC: 81,           // Holding Register 40082, UINT16, Prozent
  AUTARKY: 82,               // Holding Register 40083, UINT16, Prozent
  SELF_CONSUMPTION: 83,      // Holding Register 40084, UINT16, Prozent
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
   */
  async readLiveData(wallboxPower: number = 0): Promise<E3dcLiveData> {
    // Keine explizite Connection-Prüfung - wenn nicht connected, 
    // werden die readInt32/readUint16 Methoden einen Fehler werfen

    try {
      // Alle Register parallel auslesen für maximale Performance
      const [pvPower, batteryPower, housePower, gridPower, batterySoc, autarky, selfConsumption] = await Promise.all([
        this.readInt32(E3DC_REGISTERS.PV_POWER),
        this.readInt32(E3DC_REGISTERS.BATTERY_POWER),
        this.readInt32(E3DC_REGISTERS.HOUSE_POWER),
        this.readInt32(E3DC_REGISTERS.GRID_POWER),
        this.readUint16(E3DC_REGISTERS.BATTERY_SOC),
        this.readUint16(E3DC_REGISTERS.AUTARKY),
        this.readUint16(E3DC_REGISTERS.SELF_CONSUMPTION),
      ]);

      return {
        pvPower,
        batteryPower,
        batterySoc,
        housePower,
        gridPower,
        wallboxPower,
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
