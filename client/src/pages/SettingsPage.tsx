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
      form.reset(settings);
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
          <div>
            <h1 className="text-2xl font-bold mb-2">Einstellungen</h1>
            <p className="text-sm text-muted-foreground">
              Wallbox-Konfiguration und SmartHome-Steuerung
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">SmartHome-Steuerung</h2>
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="pv-surplus-control" className="text-sm font-medium">
                    PV Überschussladung
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatisches Laden bei Solarstrom-Überschuss
                  </p>
                </div>
                <Switch
                  id="pv-surplus-control"
                  checked={controlForm.watch("pvSurplus")}
                  onCheckedChange={(checked) => handleControlChange("pvSurplus", checked)}
                  disabled={isLoadingControls || updateControlsMutation.isPending}
                  data-testid="switch-pv-surplus"
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="battery-lock-control" className="text-sm font-medium">
                    Batterie entladen sperren
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Verhindert Entladung der Hausbatterie
                  </p>
                </div>
                <Switch
                  id="battery-lock-control"
                  checked={controlForm.watch("batteryLock")}
                  onCheckedChange={(checked) => handleControlChange("batteryLock", checked)}
                  disabled={isLoadingControls || updateControlsMutation.isPending}
                  data-testid="switch-battery-lock"
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="grid-charging-control" className="text-sm font-medium">
                    Netzstrom-Laden
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Laden des Hausspeichers mit Netzstrom
                  </p>
                </div>
                <Switch
                  id="grid-charging-control"
                  checked={controlForm.watch("gridCharging")}
                  onCheckedChange={(checked) => handleControlChange("gridCharging", checked)}
                  disabled={isLoadingControls || updateControlsMutation.isPending}
                  data-testid="switch-grid-charging"
                />
              </div>
            </div>

            <Separator />

            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
              <h2 className="text-lg font-semibold">Wallbox-Konfiguration</h2>

              <div className="space-y-2">
                <Label htmlFor="wallbox-ip" className="text-sm font-medium">
                  Wallbox IP-Adresse
                </Label>
                <Input
                  id="wallbox-ip"
                  type="text"
                  placeholder="192.168.40.16"
                  {...form.register("wallboxIp")}
                  className="h-12"
                  data-testid="input-wallbox-ip"
                />
                <p className="text-xs text-muted-foreground">
                  IP-Adresse Ihrer KEBA Wallbox im lokalen Netzwerk
                </p>
              </div>

              <Separator />

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="e3dc">
                  <AccordionTrigger className="text-base font-medium">
                    E3DC Integration (CLI)
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="e3dc-enabled" className="text-sm font-medium">
                            E3DC-Integration aktivieren
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Steuerung über e3dcset CLI-Tool
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
                          <div className="p-3 rounded-md bg-muted">
                            <p className="text-xs text-muted-foreground">
                              <strong>Hinweis:</strong> Geben Sie die vollständigen Befehlszeilen ein, 
                              die zum Steuern des E3DC-Systems ausgeführt werden sollen. 
                              Das e3dcset Tool muss im PATH verfügbar sein.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="e3dc-discharge-lock-enable" className="text-sm font-medium">
                              Entladesperre aktivieren (Befehl)
                            </Label>
                            <Input
                              id="e3dc-discharge-lock-enable"
                              type="text"
                              placeholder="e3dcset --lock-discharge"
                              {...form.register("e3dc.dischargeLockEnableCommand")}
                              className="h-12 font-mono text-sm"
                              data-testid="input-e3dc-discharge-lock-enable"
                            />
                            <p className="text-xs text-muted-foreground">
                              Befehl zum Aktivieren der Entladesperre
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="e3dc-discharge-lock-disable" className="text-sm font-medium">
                              Entladesperre deaktivieren (Befehl)
                            </Label>
                            <Input
                              id="e3dc-discharge-lock-disable"
                              type="text"
                              placeholder="e3dcset --unlock-discharge"
                              {...form.register("e3dc.dischargeLockDisableCommand")}
                              className="h-12 font-mono text-sm"
                              data-testid="input-e3dc-discharge-lock-disable"
                            />
                            <p className="text-xs text-muted-foreground">
                              Befehl zum Deaktivieren der Entladesperre
                            </p>
                          </div>

                          <Separator />

                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <Label htmlFor="e3dc-grid-charge" className="text-sm font-medium">
                                  Netzstrom-Laden während Nachtladung
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  Ermöglicht Laden des Hausspeichers mit Netzstrom im Nachtladungsintervall
                                </p>
                              </div>
                              <Switch
                                id="e3dc-grid-charge"
                                checked={form.watch("e3dc.gridChargeDuringNightCharging")}
                                onCheckedChange={(checked) => 
                                  form.setValue("e3dc.gridChargeDuringNightCharging", checked)
                                }
                                data-testid="switch-e3dc-grid-charge"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="e3dc-grid-charge-enable" className="text-sm font-medium">
                                Netzstrom-Laden aktivieren (Befehl)
                              </Label>
                              <Input
                                id="e3dc-grid-charge-enable"
                                type="text"
                                placeholder="e3dcset --enable-grid-charge"
                                {...form.register("e3dc.gridChargeEnableCommand")}
                                className="h-12 font-mono text-sm"
                                data-testid="input-e3dc-grid-charge-enable"
                              />
                              <p className="text-xs text-muted-foreground">
                                Befehl zum Aktivieren des Netzstrom-Ladens
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="e3dc-grid-charge-disable" className="text-sm font-medium">
                                Netzstrom-Laden deaktivieren (Befehl)
                              </Label>
                              <Input
                                id="e3dc-grid-charge-disable"
                                type="text"
                                placeholder="e3dcset --disable-grid-charge"
                                {...form.register("e3dc.gridChargeDisableCommand")}
                                className="h-12 font-mono text-sm"
                                data-testid="input-e3dc-grid-charge-disable"
                              />
                              <p className="text-xs text-muted-foreground">
                                Befehl zum Deaktivieren des Netzstrom-Ladens
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
                        </>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="pv-surplus">
                  <AccordionTrigger className="text-base font-medium">
                    PV Überschussladung URLs
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="pv-on" className="text-sm font-medium">
                          URL zum Einschalten
                        </Label>
                        <Input
                          id="pv-on"
                          type="url"
                          placeholder="https://smarthome.local/pv/on"
                          {...form.register("pvSurplusOnUrl")}
                          className="h-12"
                          data-testid="input-pv-on"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pv-off" className="text-sm font-medium">
                          URL zum Ausschalten
                        </Label>
                        <Input
                          id="pv-off"
                          type="url"
                          placeholder="https://smarthome.local/pv/off"
                          {...form.register("pvSurplusOffUrl")}
                          className="h-12"
                          data-testid="input-pv-off"
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="night-charging">
                  <AccordionTrigger className="text-base font-medium">
                    Nachtladung Zeitsteuerung
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="night-enabled" className="text-sm font-medium">
                            Automatische Nachtladung aktivieren
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Lädt automatisch im konfigurierten Zeitfenster
                          </p>
                        </div>
                        <Switch
                          id="night-enabled"
                          checked={form.watch("nightChargingSchedule.enabled")}
                          onCheckedChange={(checked) => {
                            // Blockiere Auto-Save bis Settings geladen UND Form hydratisiert ist
                            if (!settingsLoaded || !formHydratedRef.current) {
                              toast({
                                title: "Bitte warten",
                                description: "Einstellungen werden geladen...",
                              });
                              return;
                            }
                            
                            form.setValue("nightChargingSchedule.enabled", checked);
                            // Speichere automatisch wenn Scheduler-Switch getoggled wird
                            const currentSettings = form.getValues();
                            saveSettingsMutation.mutate(currentSettings);
                          }}
                          data-testid="switch-night-enabled"
                          disabled={isLoadingSettings || !formHydratedRef.current || saveSettingsMutation.isPending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="night-start" className="text-sm font-medium">
                          Startzeit
                        </Label>
                        <Input
                          id="night-start"
                          type="time"
                          {...form.register("nightChargingSchedule.startTime")}
                          className="h-12"
                          data-testid="input-night-start"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="night-end" className="text-sm font-medium">
                          Endzeit
                        </Label>
                        <Input
                          id="night-end"
                          type="time"
                          {...form.register("nightChargingSchedule.endTime")}
                          className="h-12"
                          data-testid="input-night-end"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Die Wallbox startet automatisch zur Startzeit und stoppt zur Endzeit.
                        Zeitfenster können über Mitternacht gehen (z.B. 22:00 - 06:00).
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

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
    </div>
  );
}
