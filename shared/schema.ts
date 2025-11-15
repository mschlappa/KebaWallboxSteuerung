import { z } from "zod";

export const wallboxStatusSchema = z.object({
  state: z.number(),
  plug: z.number(),
  input: z.number().optional(), // Potenzialfreier Kontakt (Enable-Eingang X1)
  enableSys: z.number(),
  maxCurr: z.number(),
  ePres: z.number(),
  eTotal: z.number(),
  power: z.number(),
  phases: z.number().optional(),
  i1: z.number().optional(),
  i2: z.number().optional(),
  i3: z.number().optional(),
  lastUpdated: z.string().optional(), // ISO timestamp
});

export type WallboxStatus = z.infer<typeof wallboxStatusSchema>;

export const nightChargingScheduleSchema = z.object({
  enabled: z.boolean(),
  startTime: z.string(),
  endTime: z.string(),
});

export type NightChargingSchedule = z.infer<typeof nightChargingScheduleSchema>;

export const e3dcConfigSchema = z.object({
  enabled: z.boolean(),
  prefix: z.string().optional(),
  dischargeLockEnableCommand: z.string().optional(),
  dischargeLockDisableCommand: z.string().optional(),
  gridChargeEnableCommand: z.string().optional(),
  gridChargeDisableCommand: z.string().optional(),
  gridChargeDuringNightCharging: z.boolean().optional(),
});

export type E3dcConfig = z.infer<typeof e3dcConfigSchema>;

export const chargingStrategySchema = z.enum([
  "off",
  "surplus_battery_prio",
  "surplus_vehicle_prio",
  "max_with_battery",
  "max_without_battery",
]);

export type ChargingStrategy = z.infer<typeof chargingStrategySchema>;

export const chargingStrategyConfigSchema = z.object({
  activeStrategy: chargingStrategySchema,
  minStartPowerWatt: z.number().min(500).max(5000),
  stopThresholdWatt: z.number().min(300).max(3000),
  startDelaySeconds: z.number().min(30).max(600),
  stopDelaySeconds: z.number().min(60).max(900),
  physicalPhaseSwitch: z.union([z.literal(1), z.literal(3)]).default(3),  // Physischer Schalter: 1P oder 3P
  minCurrentChangeAmpere: z.number().min(0.1).max(5),
  minChangeIntervalSeconds: z.number().min(10).max(300),
  inputX1Strategy: chargingStrategySchema.default("max_without_battery"),  // Strategie bei Input X1 = 1
});

export type ChargingStrategyConfig = z.infer<typeof chargingStrategyConfigSchema>;

export const settingsSchema = z.object({
  wallboxIp: z.string(),
  wallboxIpBackup: z.string().optional(),
  e3dcIp: z.string().optional(),
  e3dcIpBackup: z.string().optional(),
  pvSurplusOnUrl: z.string().optional(),
  pvSurplusOffUrl: z.string().optional(),
  pvSurplusOnUrlBackup: z.string().optional(),
  pvSurplusOffUrlBackup: z.string().optional(),
  nightChargingSchedule: nightChargingScheduleSchema.optional(),
  e3dc: e3dcConfigSchema.optional(),
  chargingStrategy: chargingStrategyConfigSchema.optional(),
  demoMode: z.boolean().optional(),
  mockWallboxPhases: z.union([z.literal(1), z.literal(3)]).optional().default(3),
  mockWallboxPlugStatus: z.number().min(0).max(7).optional().default(7), // 0-7 gemäß KEBA Spezifikation
  mockTimeEnabled: z.boolean().optional(), // Mock-Zeit aktiviert/deaktiviert
  mockDateTime: z.string().optional(), // Format "YYYY-MM-DDTHH:MM" für Demo-Modus Datum+Zeit-Simulation (Jahreszeit → PV-Leistung)
});

export type Settings = z.infer<typeof settingsSchema>;

export const controlStateSchema = z.object({
  pvSurplus: z.boolean(),
  nightCharging: z.boolean(),
  batteryLock: z.boolean(),
  gridCharging: z.boolean(),
});

export type ControlState = z.infer<typeof controlStateSchema>;

export const plugStatusTrackingSchema = z.object({
  lastPlugStatus: z.number().optional(),
  lastPlugChange: z.string().optional(), // ISO timestamp
});

export type PlugStatusTracking = z.infer<typeof plugStatusTrackingSchema>;

export const logLevelSchema = z.enum(["debug", "info", "warning", "error"]);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const logEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: logLevelSchema,
  category: z.enum(["wallbox", "wallbox-mock", "e3dc", "e3dc-mock", "fhem", "fhem-mock", "webhook", "system", "storage"]),
  message: z.string(),
  details: z.string().optional(),
});

export type LogEntry = z.infer<typeof logEntrySchema>;

export const logSettingsSchema = z.object({
  level: logLevelSchema,
});

export type LogSettings = z.infer<typeof logSettingsSchema>;

export const e3dcBatteryStatusSchema = z.object({
  soc: z.number(),
  power: z.number(),
  maxChargePower: z.number(),
  maxDischargePower: z.number(),
  dischargeLocked: z.boolean(),
});

export type E3dcBatteryStatus = z.infer<typeof e3dcBatteryStatusSchema>;

export const e3dcLiveDataSchema = z.object({
  pvPower: z.number(),
  batteryPower: z.number(),
  batterySoc: z.number(),
  housePower: z.number(),
  gridPower: z.number(),
  wallboxPower: z.number(),
  autarky: z.number(),
  selfConsumption: z.number(),
  timestamp: z.string(),
});

export type E3dcLiveData = z.infer<typeof e3dcLiveDataSchema>;

export const chargingContextSchema = z.object({
  strategy: chargingStrategySchema,
  isActive: z.boolean(),
  currentAmpere: z.number(),
  targetAmpere: z.number(),
  currentPhases: z.number(),
  lastAdjustment: z.string().optional(),
  startDelayTrackerSince: z.string().optional(),
  belowThresholdSince: z.string().optional(),
  adjustmentCount: z.number(),
  calculatedSurplus: z.number().optional(),
});

export type ChargingContext = z.infer<typeof chargingContextSchema>;
