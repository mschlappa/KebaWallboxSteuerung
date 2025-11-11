import { z } from "zod";

export const wallboxStatusSchema = z.object({
  state: z.number(),
  plug: z.number(),
  enableSys: z.number(),
  maxCurr: z.number(),
  ePres: z.number(),
  eTotal: z.number(),
  power: z.number(),
  phases: z.number().optional(),
  i1: z.number().optional(),
  i2: z.number().optional(),
  i3: z.number().optional(),
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

export const settingsSchema = z.object({
  wallboxIp: z.string(),
  pvSurplusOnUrl: z.string().optional(),
  pvSurplusOffUrl: z.string().optional(),
  nightChargingSchedule: nightChargingScheduleSchema.optional(),
  e3dc: e3dcConfigSchema.optional(),
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
  category: z.enum(["wallbox", "webhook", "system"]),
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
