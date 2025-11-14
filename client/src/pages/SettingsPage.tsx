import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { settingsSchema, controlStateSchema } from "@shared/schema";
import type { Settings, ControlState } from "@shared/schema";

export default function SettingsPage() {
  const { toast } = useToast();
  const formHydratedRef = useRef(false);

  const { data: settings, isLoading: isLoadingSettings, isSuccess: settingsLoaded } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: controlState, isLoading: isLoadingControls } = useQuery<ControlState>({
    queryKey: ["/api/controls"],
  });

  const form = useForm<Settings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      wallboxIp: "192.168.40.16",
      e3dcIp: "",
      pvSurplusOnUrl: "",
      pvSurplusOffUrl: "",
      nightChargingSchedule: {
        enabled: false,
        startTime: "00:00",
        endTime: "05:00",
      },
      e3dc: {
        enabled: false,
        dischargeLockEnableCommand: "",
        dischargeLockDisableCommand: "",
        gridChargeEnableCommand: "",
        gridChargeDisableCommand: "",
        gridChargeDuringNightCharging: false,
      },
      chargingStrategy: {
        activeStrategy: "off",
        minStartPowerWatt: 1400,
        stopThresholdWatt: 1000,
        startDelaySeconds: 120,
        stopDelaySeconds: 300,
        minCurrentChangeAmpere: 1,
        minChangeIntervalSeconds: 60,
      },
      demoMode: false,
      mockWallboxPhases: 3,
    },
  });

  const controlForm = useForm<ControlState>({
    resolver: zodResolver(controlStateSchema),
    defaultValues: {
      pvSurplus: false,
      nightCharging: false,
      batteryLock: false,
      gridCharging: false,
    },
  });

  useEffect(() => {
    if (settings) {
      const strategyDefaults = {
        activeStrategy: "off" as const,
        minStartPowerWatt: 1400,
        stopThresholdWatt: 1000,
        startDelaySeconds: 120,
        stopDelaySeconds: 300,
        minCurrentChangeAmpere: 1,
        minChangeIntervalSeconds: 60,
      };
      
      form.reset({
        ...settings,
        chargingStrategy: {
          ...strategyDefaults,
          ...settings.chargingStrategy,
        },
      });
      formHydratedRef.current = true;
    }
  }, [settings, form]);

  useEffect(() => {
    if (controlState) {
      controlForm.reset(controlState);
    }
  }, [controlState, controlForm]);

  const saveSettingsMutation = useMutation({
    mutationFn: (data: Settings) =>
      apiRequest("POST", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Einstellungen gespeichert",
        description: "Ihre Konfiguration wurde erfolgreich gespeichert.",
      });
    },
    onError: () => {
      // Bei Fehler: Settings neu laden um UI-Zustand zu synchronisieren
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Fehler",
        description: "Die Einstellungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  const updateControlsMutation = useMutation({
    mutationFn: (newState: ControlState) =>
      apiRequest("POST", "/api/controls", newState),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controls"] });
      toast({
        title: "Steuerung aktualisiert",
        description: "Die SmartHome-Funktion wurde erfolgreich geändert.",
      });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controls"] });
      toast({
        title: "Fehler",
        description: "Die Steuerung konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  const handleSave = (data: Settings) => {
    saveSettingsMutation.mutate(data);
  };

  const handleControlChange = (field: keyof ControlState, value: boolean) => {
    controlForm.setValue(field, value);
    
    // Sende nur das geänderte Feld - nightCharging wird NIE vom Client gesendet
    const currentState = controlForm.getValues();
    const updates: Partial<ControlState> = {
      [field]: value,
    };
    
    // Füge alle anderen Felder hinzu AUSSER nightCharging (scheduler-only)
    const fullState: ControlState = {
      pvSurplus: field === 'pvSurplus' ? value : currentState.pvSurplus,
      batteryLock: field === 'batteryLock' ? value : currentState.batteryLock,
      gridCharging: field === 'gridCharging' ? value : currentState.gridCharging,
      nightCharging: currentState.nightCharging, // Immer aktueller Wert, wird nicht geändert
    };
    
    updateControlsMutation.mutate(fullState);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pb-24 pt-6">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
              <h1 className="text-2xl font-bold mb-0">Einstellungen</h1>
            </div>
            {settings?.demoMode && (
              <Badge variant="secondary" className="text-xs shrink-0" data-testid="badge-demo-mode">
                Demo
              </Badge>
            )}
          </div>

          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
            <div className="flex flex-col p-4 border rounded-lg space-y-3 bg-accent/30">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="demo-mode" className="text-base font-medium">
                    Demo-Modus
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Verwendet simulierte Daten ohne echte Hardware
                  </p>
                </div>
                <Switch
                  id="demo-mode"
                  checked={form.watch("demoMode") ?? false}
                  onCheckedChange={(checked) => {
                    if (!settingsLoaded || !formHydratedRef.current) {
                      toast({
                        title: "Bitte warten",
                        description: "Einstellungen werden geladen...",
                      });
                      return;
                    }
                    
                    form.setValue("demoMode", checked);
                    const currentSettings = form.getValues();
                    saveSettingsMutation.mutate(currentSettings);
                  }}
                  data-testid="switch-demo-mode"
                  disabled={isLoadingSettings || !formHydratedRef.current || saveSettingsMutation.isPending}
                />
              </div>
              
              {form.watch("demoMode") && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="mock-wallbox-phases" className="text-sm font-medium">
                      Mock-Wallbox Phasen
                    </Label>
                    <Select
                      value={String(form.watch("mockWallboxPhases") ?? 3)}
                      onValueChange={(value) => form.setValue("mockWallboxPhases", Number(value) as 1 | 3)}
                    >
                      <SelectTrigger id="mock-wallbox-phases" className="h-12" data-testid="select-mock-phases">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Phase (einphasig)</SelectItem>
                        <SelectItem value="3">3 Phasen (dreiphasig)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Simuliert den physischen Phasen-Umschalter der Wallbox
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Simulierte Tageszeit
                    </Label>
                    <div className="flex items-center gap-3">
                      <Switch
                        id="mock-time-enabled"
                        checked={form.watch("mockTimeEnabled") ?? false}
                        onCheckedChange={(checked) => {
                          form.setValue("mockTimeEnabled", checked);
                          if (checked) {
                            const now = new Date();
                            const year = now.getFullYear();
                            const month = String(now.getMonth() + 1).padStart(2, '0');
                            const day = String(now.getDate()).padStart(2, '0');
                            form.setValue("mockDateTime", `${year}-${month}-${day}T12:00`);
                          } else {
                            form.setValue("mockDateTime", "");
                          }
                        }}
                        data-testid="switch-mock-time-enabled"
                      />
                      {form.watch("mockTimeEnabled") && (
                        <Input
                          id="mock-datetime"
                          type="datetime-local"
                          {...form.register("mockDateTime")}
                          className="h-12 border-none bg-transparent p-0 pl-3 text-left focus-visible:ring-0 [-webkit-appearance:none] [&::-webkit-calendar-picker-indicator]:dark:invert [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit-text]:p-0 [&::-webkit-datetime-edit-text]:m-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0"
                          data-testid="input-mock-datetime"
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Datum steuert Jahreszeit (Winter: ~3.5kW Peak, Sommer: ~8kW Peak), Uhrzeit die PV-Kurve
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <Button
                    type="button"
                    onClick={() => {
                      const currentSettings = form.getValues();
                      saveSettingsMutation.mutate(currentSettings);
                    }}
                    disabled={saveSettingsMutation.isPending}
                    className="w-full"
                    data-testid="button-save-demo-settings"
                  >
                    {saveSettingsMutation.isPending ? "Speichern..." : "Demo-Einstellungen speichern"}
                  </Button>
                </>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="wallbox-ip" className="text-base font-medium">
                IP-Adresse Wallbox
              </Label>
              <Input
                id="wallbox-ip"
                type="text"
                placeholder="192.168.40.16"
                {...form.register("wallboxIp")}
                className="h-12"
                data-testid="input-wallbox-ip"
                disabled={form.watch("demoMode") ?? false}
              />
              <p className="text-xs text-muted-foreground">
                IP-Adresse Ihrer KEBA P20 Wallbox im lokalen Netzwerk
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="e3dc-ip" className="text-base font-medium">
                IP-Adresse Hauskraftwerk
              </Label>
              <Input
                id="e3dc-ip"
                type="text"
                placeholder="192.168.40.17"
                {...form.register("e3dcIp")}
                className="h-12"
                data-testid="input-e3dc-ip"
                disabled={form.watch("demoMode") ?? false}
              />
              <p className="text-xs text-muted-foreground">
                IP-Adresse Ihres E3DC S10 für Modbus TCP-Zugriff (Port 502)
              </p>
            </div>

            <Separator />

            <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="e3dc-enabled" className="text-sm font-medium">
                      E3DC-Integration
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Steuerung über Kommandozeilen-Tool e3dcset
                    </p>
                  </div>
                  <Switch
                    id="e3dc-enabled"
                    checked={form.watch("e3dc.enabled")}
                    onCheckedChange={(checked) => 
                      form.setValue("e3dc.enabled", checked)
                    }
                    data-testid="switch-e3dc-enabled"
                  />
                </div>

                {form.watch("e3dc.enabled") && (
                  <>
                    <Separator />

                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="e3dc-prefix" className="text-sm font-medium">
                          CLI-Tool & Konfiguration (Prefix)
                        </Label>
                        <Input
                          id="e3dc-prefix"
                          type="text"
                          placeholder="/opt/keba-wallbox/e3dcset -p /opt/keba-wallbox/e3dcset.config"
                          {...form.register("e3dc.prefix")}
                          className="h-12 font-mono text-sm"
                          data-testid="input-e3dc-prefix"
                        />
                        <p className="text-xs text-muted-foreground">
                          Gemeinsamer Teil aller Befehle (Pfad zum Tool + Konfigurationsdatei)
                        </p>
                      </div>

                      <div className="p-3 rounded-md bg-muted">
                        <p className="text-xs text-muted-foreground">
                          <strong>Hinweis:</strong> Der Prefix wird automatisch vor jeden Parameter gesetzt. 
                          Geben Sie in den folgenden Feldern nur die spezifischen Parameter ein (z.B. "-d 1").
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="e3dc-discharge-lock-enable" className="text-sm font-medium">
                          Entladesperre aktivieren (Parameter)
                        </Label>
                        <Input
                          id="e3dc-discharge-lock-enable"
                          type="text"
                          placeholder="-d 1"
                          {...form.register("e3dc.dischargeLockEnableCommand")}
                          className="h-12 font-mono text-sm"
                          data-testid="input-e3dc-discharge-lock-enable"
                        />
                        <p className="text-xs text-muted-foreground">
                          Parameter zum Aktivieren der Entladesperre
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="e3dc-discharge-lock-disable" className="text-sm font-medium">
                          Entladesperre deaktivieren (Parameter)
                        </Label>
                        <Input
                          id="e3dc-discharge-lock-disable"
                          type="text"
                          placeholder="-a"
                          {...form.register("e3dc.dischargeLockDisableCommand")}
                          className="h-12 font-mono text-sm"
                          data-testid="input-e3dc-discharge-lock-disable"
                        />
                        <p className="text-xs text-muted-foreground">
                          Parameter zum Deaktivieren der Entladesperre
                        </p>
                      </div>

                      <Separator />

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="e3dc-grid-charge-enable" className="text-sm font-medium">
                            Netzstrom-Laden aktivieren (Parameter)
                          </Label>
                          <Input
                            id="e3dc-grid-charge-enable"
                            type="text"
                            placeholder="-c 2500 -e 6000"
                            {...form.register("e3dc.gridChargeEnableCommand")}
                            className="h-12 font-mono text-sm"
                            data-testid="input-e3dc-grid-charge-enable"
                          />
                          <p className="text-xs text-muted-foreground">
                            Parameter zum Aktivieren des Netzstrom-Ladens
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="e3dc-grid-charge-disable" className="text-sm font-medium">
                            Netzstrom-Laden deaktivieren (Parameter)
                          </Label>
                          <Input
                            id="e3dc-grid-charge-disable"
                            type="text"
                            placeholder="-e 0"
                            {...form.register("e3dc.gridChargeDisableCommand")}
                            className="h-12 font-mono text-sm"
                            data-testid="input-e3dc-grid-charge-disable"
                          />
                          <p className="text-xs text-muted-foreground">
                            Parameter zum Deaktivieren des Netzstrom-Ladens
                          </p>
                        </div>
                      </div>

                      <div className="p-3 rounded-md bg-muted">
                        <p className="text-xs text-muted-foreground">
                          <strong>Hinweis:</strong> Die E3DC-Integration steuert die 
                          Batterie-Entladesperre und das Netzstrom-Laden direkt über das e3dcset CLI-Tool. 
                          Stellen Sie sicher, dass die entsprechenden Befehle korrekt konfiguriert sind.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

            <Separator />

            <div className="border rounded-lg p-4 space-y-3">
              <div className="space-y-2">
                <Label className="text-base font-medium">
                  Ladestrategie-Parameter
                </Label>
                <p className="text-xs text-muted-foreground">
                  Die aktive Strategie kann auf der Statusseite gewählt werden
                </p>
              </div>

              <Separator />
              
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="min-start-power" className="text-sm font-medium">
                    Mindest-Startleistung (W)
                  </Label>
                  <Input
                    id="min-start-power"
                    type="number"
                    min="500"
                    max="5000"
                    step="100"
                    {...form.register("chargingStrategy.minStartPowerWatt", { valueAsNumber: true })}
                    className="h-12"
                    data-testid="input-min-start-power"
                  />
                  <p className="text-xs text-muted-foreground">
                    Mindest-Überschuss zum Starten der Ladung (500-5000 W)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stop-threshold" className="text-sm font-medium">
                    Stopp-Schwellwert (W)
                  </Label>
                  <Input
                    id="stop-threshold"
                    type="number"
                    min="300"
                    max="3000"
                    step="100"
                    {...form.register("chargingStrategy.stopThresholdWatt", { valueAsNumber: true })}
                    className="h-12"
                    data-testid="input-stop-threshold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Unterschreitet der Überschuss diesen Wert, wird die Ladung gestoppt (300-3000 W)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start-delay" className="text-sm font-medium">
                    Start-Verzögerung (Sekunden)
                  </Label>
                  <Input
                    id="start-delay"
                    type="number"
                    min="30"
                    max="600"
                    step="30"
                    {...form.register("chargingStrategy.startDelaySeconds", { valueAsNumber: true })}
                    className="h-12"
                    data-testid="input-start-delay"
                  />
                  <p className="text-xs text-muted-foreground">
                    Wartezeit bevor Ladung startet (30-600 s)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stop-delay" className="text-sm font-medium">
                    Stopp-Verzögerung (Sekunden)
                  </Label>
                  <Input
                    id="stop-delay"
                    type="number"
                    min="60"
                    max="900"
                    step="60"
                    {...form.register("chargingStrategy.stopDelaySeconds", { valueAsNumber: true })}
                    className="h-12"
                    data-testid="input-stop-delay"
                  />
                  <p className="text-xs text-muted-foreground">
                    Wartezeit bevor Ladung stoppt (60-900 s)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="min-current-change" className="text-sm font-medium">
                    Mindest-Stromänderung (A)
                  </Label>
                  <Input
                    id="min-current-change"
                    type="number"
                    min="0.1"
                    max="5"
                    step="0.1"
                    {...form.register("chargingStrategy.minCurrentChangeAmpere", { valueAsNumber: true })}
                    className="h-12"
                    data-testid="input-min-current-change"
                  />
                  <p className="text-xs text-muted-foreground">
                    Mindestdifferenz für Stromänderung (0.1-5 A)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="min-change-interval" className="text-sm font-medium">
                    Mindest-Änderungsintervall (Sekunden)
                  </Label>
                  <Input
                    id="min-change-interval"
                    type="number"
                    min="10"
                    max="300"
                    step="10"
                    {...form.register("chargingStrategy.minChangeIntervalSeconds", { valueAsNumber: true })}
                    className="h-12"
                    data-testid="input-min-change-interval"
                  />
                  <p className="text-xs text-muted-foreground">
                    Mindestabstand zwischen Stromänderungen (10-300 s)
                  </p>
                </div>

                <div className="p-3 rounded-md bg-muted">
                  <p className="text-xs text-muted-foreground">
                    <strong>Hinweis:</strong> Die Strategie steuert automatisch den Ladestrom basierend auf dem verfügbaren PV-Überschuss.
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full h-12 text-base font-medium"
              data-testid="button-save-settings"
              disabled={isLoadingSettings || saveSettingsMutation.isPending}
            >
              {saveSettingsMutation.isPending ? "Wird gespeichert..." : "Einstellungen speichern"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
