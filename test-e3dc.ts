/**
 * Direkter Test der easy-rscp Library
 * Basierend auf: https://jnk-cons.github.io/easy-rscp/getting-started/hello-world/
 */

import {
  DefaultHomePowerPlantConnection,
  E3dcConnectionData,
  RijndaelJsAESCipherFactory,
  DefaultLiveDataService,
  DefaultBatteryService,
  DefaultInfoService,
  DefaultChargingService,
} from 'easy-rscp';

// WICHTIG: Ihre E3DC-Credentials hier eintragen!
const config: E3dcConnectionData = {
  address: '192.168.40.200', // Ihre E3DC IP
  port: 5033,
  portalUser: 'marcus@schlappa.de', // Portal-Username
  portalPassword: 'xxx', // Portal-Passwort - BITTE ERGÄNZEN!
  rscpPassword: 'xxx', // RSCP-Passwort - BITTE ERGÄNZEN!
  connectionTimeoutMillis: 10000,
  readTimeoutMillis: 30000,
};

async function testE3dcConnection() {
  console.log('=== E3DC Connection Test ===\n');
  console.log('Verbinde zu:', config.address);
  
  // Erstelle Verbindung
  const aesFactory = new RijndaelJsAESCipherFactory(config.rscpPassword);
  const connection = new DefaultHomePowerPlantConnection(config, aesFactory);

  try {
    console.log('✓ Connection erstellt');
    
    // Test 1: System-Info
    console.log('\n--- Test 1: System-Info ---');
    const infoService = new DefaultInfoService(connection);
    const systemInfo = await infoService.readSystemInfo();
    console.log('System Info:', JSON.stringify(systemInfo, null, 2));
    
    // Test 2: LiveData (PowerState)
    console.log('\n--- Test 2: LiveData (PowerState) ---');
    const liveDataService = new DefaultLiveDataService(connection);
    const powerState = await liveDataService.readPowerState();
    console.log('Power State:', JSON.stringify(powerState, null, 2));
    
    // Test 3: Battery Monitoring
    console.log('\n--- Test 3: Battery Monitoring ---');
    const batteryService = new DefaultBatteryService(connection);
    
    try {
      const batteryStatus = await batteryService.readMonitoringData();
      console.log('Battery Status:', JSON.stringify(batteryStatus, null, 2));
    } catch (error) {
      console.error('❌ Battery Monitoring fehlgeschlagen:', error instanceof Error ? error.message : String(error));
    }
    
    // Test 4: Charging Configuration (Die wichtige Funktion!)
    console.log('\n--- Test 4: Charging Configuration ---');
    const chargingService = new DefaultChargingService(connection);
    
    try {
      const chargingConfig = await chargingService.readConfiguration();
      console.log('Charging Config:', JSON.stringify(chargingConfig, null, 2));
      
      console.log('\n--- Test 5: Setze Entladesperre (0 W) ---');
      const lockResult = await chargingService.writeLimits({
        maxCurrentChargingPower: chargingConfig.currentLimitations.maxCurrentChargingPower,
        maxCurrentDischargingPower: 0, // ENTLADUNG SPERREN
        dischargeStartPower: chargingConfig.currentLimitations.dischargeStartPower,
        chargingLimitationsEnabled: true,
      });
      console.log('Lock Result:', JSON.stringify(lockResult, null, 2));
      
      console.log('\n✅ Entladesperre gesetzt! Prüfen Sie Ihr E3DC-Display!');
      
    } catch (error) {
      console.error('❌ Charging Service fehlgeschlagen:', error instanceof Error ? error.message : String(error));
    }
    
    console.log('\n✅ Test abgeschlossen');
    
  } catch (error) {
    console.error('\n❌ Fehler:', error);
    console.error('Stack:', error instanceof Error ? error.stack : '');
  } finally {
    await connection.disconnect();
    console.log('\n✓ Verbindung getrennt');
  }
}

testE3dcConnection().catch(console.error);
