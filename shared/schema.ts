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

export const settingsSchema = z.object({
  wallboxIp: z.string(),
  pvSurplusOnUrl: z.string().optional(),
  pvSurplusOffUrl: z.string().optional(),
  nightChargingOnUrl: z.string().optional(),
  nightChargingOffUrl: z.string().optional(),
  batteryLockOnUrl: z.string().optional(),
  batteryLockOffUrl: z.string().optional(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const controlStateSchema = z.object({
  pvSurplus: z.boolean(),
  nightCharging: z.boolean(),
  batteryLock: z.boolean(),
});

export type ControlState = z.infer<typeof controlStateSchema>;

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
