import {
  DefaultHomePowerPlantConnection,
  E3dcConnectionData,
  RijndaelJsAESCipherFactory,
  DefaultBatteryService,
  DefaultChargingService,
  DefaultLiveDataService,
  ChargingLimits,
} from 'easy-rscp';
import type { E3dcConfig, E3dcBatteryStatus } from '@shared/schema';

class E3dcClient {
  private config: E3dcConfig | null = null;

  configure(config: E3dcConfig): void {
    if (!config.enabled || !config.ipAddress || !config.rscpPassword || !config.portalUsername || !config.portalPassword) {
      throw new Error('E3DC configuration incomplete');
    }
    this.config = config;
  }

  disconnect(): void {
    this.config = null;
  }

  private createConnection(): DefaultHomePowerPlantConnection {
    if (!this.config) {
      throw new Error('E3DC not configured');
    }

    const connectionData: E3dcConnectionData = {
      address: this.config.ipAddress!,
      port: 5033,
      portalUser: this.config.portalUsername!,
      portalPassword: this.config.portalPassword!,
      rscpPassword: this.config.rscpPassword!,
      connectionTimeoutMillis: 10000,
      readTimeoutMillis: 30000,
    };

    const aesFactory = new RijndaelJsAESCipherFactory(this.config.rscpPassword!);
    return new DefaultHomePowerPlantConnection(connectionData, aesFactory);
  }

  async getBatteryStatus(): Promise<E3dcBatteryStatus> {
    const connection = this.createConnection();
    
    try {
      const liveDataService = new DefaultLiveDataService(connection);
      const powerState = await liveDataService.readPowerState();

      return {
        soc: powerState.batteryChargingLevel,
        power: powerState.batteryDelivery,
        maxChargePower: 0, // Wird später über Charging-Limits ermittelt
        maxDischargePower: 0, // Wird später über Charging-Limits ermittelt
        dischargeLocked: false, // Wird über lockDischarge/unlockDischarge gesteuert
      };
    } finally {
      await connection.disconnect();
    }
  }

  async lockDischarge(): Promise<void> {
    const connection = this.createConnection();
    
    try {
      const chargingService = new DefaultChargingService(connection);

      // Setze nur Entladeleistung auf 0, ohne vorher readConfiguration() zu rufen
      const newLimits: ChargingLimits = {
        maxCurrentChargingPower: 4600, // Typischer Wert für E3DC S10
        maxCurrentDischargingPower: 0, // Entladung sperren
        dischargeStartPower: 65, // Typischer Wert
        chargingLimitationsEnabled: true,
      };

      await chargingService.writeLimits(newLimits);
    } finally {
      await connection.disconnect();
    }
  }

  async unlockDischarge(maxDischargePower: number = 5000): Promise<void> {
    const connection = this.createConnection();
    
    try {
      const chargingService = new DefaultChargingService(connection);
      
      // Hole aktuelle Konfiguration
      const currentConfig = await chargingService.readConfiguration();

      // Entferne Entladesperre
      const newLimits: ChargingLimits = {
        maxCurrentChargingPower: currentConfig.currentLimitations.maxCurrentChargingPower,
        maxCurrentDischargingPower: maxDischargePower,
        dischargeStartPower: currentConfig.currentLimitations.dischargeStartPower,
        chargingLimitationsEnabled: true,
      };

      await chargingService.writeLimits(newLimits);
    } finally {
      await connection.disconnect();
    }
  }

  isConfigured(): boolean {
    return this.config !== null && this.config.enabled === true;
  }
}

export const e3dcClient = new E3dcClient();
