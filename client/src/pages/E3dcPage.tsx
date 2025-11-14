import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Battery, Home as HomeIcon, Sun, Grid3x3, TrendingUp, TrendingDown, AlertCircle, PlugZap, ShieldOff, Zap, Clock, Settings as SettingsIcon } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { E3dcLiveData, Settings, ControlState } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function E3dcPage() {
  const [showBatteryDrawer, setShowBatteryDrawer] = useState(false);
  const [relativeUpdateTime, setRelativeUpdateTime] = useState<string>("");
  const { toast } = useToast();

  // Lade Settings (für Fehler-Anzeige bei Connection-Fehlern)
  const { data: settings, isLoading: isLoadingSettings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  // Lade Control State
  const { data: controlState, isLoading: isLoadingControls } = useQuery<ControlState>({
    queryKey: ["/api/controls"],
  });

  // Lade E3DC Live-Daten (Backend liefert automatisch Mock wenn keine IP konfiguriert)
  const { data: e3dcData, isLoading, error, refetch } = useQuery<E3dcLiveData>({
    queryKey: ["/api/e3dc/live-data"],
    refetchInterval: 5000, // Aktualisiere alle 5 Sekunden
  });

  // Mutation für Control State Updates (MUSS vor jedem Return definiert werden!)
  const updateControlsMutation = useMutation({
    mutationFn: (newState: ControlState) =>
      apiRequest("POST", "/api/controls", newState),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controls"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controls"] });
    },
  });

  // Mutation für Settings Updates (gridChargeDuringNightCharging)
  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: Settings) =>
      apiRequest("POST", "/api/settings", newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  // Formatiere Leistungswerte: Unter 10 kW in Watt, ab 10 kW in kW
  const formatPower = (watts: number) => {
    if (watts === 0) return "0 W";
    if (Math.abs(watts) >= 10000) {
      return `${(watts / 1000).toFixed(1)} kW`;
    }
    return `${Math.round(watts)} W`;
  };

  // Demo-Modus aktiv wenn in Settings aktiviert
  const isDemoMode = settings?.demoMode === true;

  // Fehler beim Laden der E3DC-Daten
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto pb-24 pt-6">
          <div className="max-w-2xl mx-auto px-4 space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
                <h1 className="text-2xl font-bold mb-0">Hauskraftwerk</h1>
              </div>
              {isDemoMode && (
                <Badge variant="secondary" className="text-xs shrink-0" data-testid="badge-demo-mode">
                  Demo
                </Badge>
              )}
            </div>

            <Card className="max-w-md">
              <CardHeader>
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-5 h-5" />
                  <CardTitle>Verbindungsfehler</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {settings?.e3dcIp 
                    ? `Verbindung zum E3DC S10 (${settings.e3dcIp}) fehlgeschlagen.`
                    : "Verbindung zum E3DC S10 fehlgeschlagen."}
                </p>
                <p className="text-xs text-muted-foreground">
                  Fehler: {error instanceof Error ? error.message : String(error)}
                </p>
                <Button onClick={() => refetch()} className="w-full" data-testid="button-retry">
                  Erneut versuchen
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Berechne ob Batterie lädt oder entlädt
  const isBatteryCharging = (e3dcData?.batteryPower || 0) > 100;
  const isBatteryDischarging = (e3dcData?.batteryPower || 0) < -100;

  // Berechne Hausverbrauch ohne Wallbox
  const actualHousePower = (e3dcData?.housePower || 0) - (e3dcData?.wallboxPower || 0);

  // E3DC Integration aktiv?
  const isE3dcEnabled = settings?.e3dc?.enabled === true;

  // Formatiere relative Zeit (Deutsch)
  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    // Schutz gegen Zukunfts-Timestamps (Systemuhr-Differenzen)
    if (diffInSeconds < 0) {
      return 'gerade eben';
    }

    if (diffInSeconds === 0) {
      return 'gerade eben';
    }
    
    if (diffInSeconds === 1) {
      return 'vor 1 Sekunde';
    }
    
    if (diffInSeconds < 60) {
      return `vor ${diffInSeconds} Sekunden`;
    }
    
    if (diffInSeconds < 120) {
      return 'vor 1 Minute';
    }
    
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `vor ${minutes} Minuten`;
    }
    
    if (diffInSeconds < 7200) {
      return 'vor 1 Stunde';
    }
    
    const hours = Math.floor(diffInSeconds / 3600);
    return `vor ${hours} Stunden`;
  };

  // Update relative time every second
  useEffect(() => {
    if (!e3dcData?.timestamp) {
      setRelativeUpdateTime("");
      return;
    }

    const updateRelativeTime = () => {
      setRelativeUpdateTime(formatRelativeTime(e3dcData.timestamp!));
    };

    updateRelativeTime();
    const interval = setInterval(updateRelativeTime, 1000);

    return () => clearInterval(interval);
  }, [e3dcData?.timestamp]);

  const handleControlChange = (field: keyof ControlState, value: boolean) => {
    if (!controlState) return;
    
    const fullState: ControlState = {
      pvSurplus: controlState.pvSurplus,
      batteryLock: field === 'batteryLock' ? value : controlState.batteryLock,
      gridCharging: field === 'gridCharging' ? value : controlState.gridCharging,
      nightCharging: controlState.nightCharging,
    };
    
    updateControlsMutation.mutate(fullState);
  };

  const handleGridChargeDuringNightChange = (value: boolean) => {
    if (!settings) return;
    
    const updatedSettings: Settings = {
      ...settings,
      e3dc: {
        enabled: settings.e3dc?.enabled || false,
        prefix: settings.e3dc?.prefix,
        dischargeLockEnableCommand: settings.e3dc?.dischargeLockEnableCommand,
        dischargeLockDisableCommand: settings.e3dc?.dischargeLockDisableCommand,
        gridChargeEnableCommand: settings.e3dc?.gridChargeEnableCommand,
        gridChargeDisableCommand: settings.e3dc?.gridChargeDisableCommand,
        gridChargeDuringNightCharging: value,
      },
    };
    
    updateSettingsMutation.mutate(updatedSettings);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pb-24 pt-6">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
              <h1 className="text-2xl font-bold mb-0">Hauskraftwerk</h1>
            </div>
            {isDemoMode && (
              <Badge variant="secondary" className="text-xs shrink-0" data-testid="badge-demo-mode">
                Demo
              </Badge>
            )}
          </div>

          <div className="space-y-4">
            {/* Hausbatterie + PV - 2x2 Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Hausbatterie SOC */}
              <Card 
                className={`p-6 relative ${isE3dcEnabled ? 'cursor-pointer hover-elevate active-elevate-2' : ''}`}
                onClick={() => isE3dcEnabled && setShowBatteryDrawer(true)}
                data-testid="card-battery-soc"
              >
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : e3dcData ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Battery className="w-4 h-4 text-muted-foreground" />
                      <span className="text-base font-semibold">Ladezustand</span>
                      {isE3dcEnabled && (controlState?.batteryLock || controlState?.gridCharging || settings?.e3dc?.gridChargeDuringNightCharging) && (
                        <div className="flex items-center gap-1.5 ml-1">
                          {controlState?.batteryLock && (
                            <ShieldOff className="w-4 h-4 text-muted-foreground" data-testid="icon-battery-lock-active" />
                          )}
                          {controlState?.gridCharging && (
                            <Zap className="w-4 h-4 text-muted-foreground" data-testid="icon-grid-charging-active" />
                          )}
                          {settings?.e3dc?.gridChargeDuringNightCharging && (
                            <Clock className="w-4 h-4 text-muted-foreground" data-testid="icon-grid-charge-night-active" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-battery-soc">
                      {e3dcData.batterySoc}%
                    </div>
                  </div>
                ) : null}
                {isE3dcEnabled && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="absolute bottom-3 right-3">
                          <SettingsIcon 
                            className="w-4 h-4 text-muted-foreground" 
                            data-testid="icon-config-indicator-soc"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Konfiguration verfügbar</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </Card>

              {/* Hausbatterie Leistung */}
              <Card 
                className={`p-6 relative ${isE3dcEnabled ? 'cursor-pointer hover-elevate active-elevate-2' : ''}`}
                onClick={() => isE3dcEnabled && setShowBatteryDrawer(true)}
                data-testid="card-battery-power"
              >
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : e3dcData ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-muted-foreground" />
                      <span className="text-base font-semibold">Leistung</span>
                      {isE3dcEnabled && (controlState?.batteryLock || controlState?.gridCharging || settings?.e3dc?.gridChargeDuringNightCharging) && (
                        <div className="flex items-center gap-1.5 ml-1">
                          {controlState?.batteryLock && (
                            <ShieldOff className="w-4 h-4 text-muted-foreground" data-testid="icon-battery-lock-active-power" />
                          )}
                          {controlState?.gridCharging && (
                            <Zap className="w-4 h-4 text-muted-foreground" data-testid="icon-grid-charging-active-power" />
                          )}
                          {settings?.e3dc?.gridChargeDuringNightCharging && (
                            <Clock className="w-4 h-4 text-muted-foreground" data-testid="icon-grid-charge-night-active-power" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isBatteryCharging && <TrendingUp className="w-4 h-4 text-muted-foreground" />}
                      {isBatteryDischarging && <TrendingDown className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-2xl font-bold" data-testid="text-battery-power">
                        {formatPower(Math.abs(e3dcData.batteryPower))}
                      </span>
                    </div>
                  </div>
                ) : null}
                {isE3dcEnabled && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="absolute bottom-3 right-3">
                          <SettingsIcon 
                            className="w-4 h-4 text-muted-foreground" 
                            data-testid="icon-config-indicator-power"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Konfiguration verfügbar</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </Card>
            </div>

            {/* PV, Wallbox, Hausverbrauch, Netz - 2x2 Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* PV-Leistung */}
              <Card className="p-6">
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : e3dcData ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Sun className="w-4 h-4 text-muted-foreground" />
                      <span className="text-base font-semibold">PV</span>
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-pv-power">
                      {formatPower(e3dcData.pvPower)}
                    </div>
                  </div>
                ) : null}
              </Card>

              {/* Wallbox */}
              <Card className="p-6">
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : e3dcData ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <PlugZap className="w-4 h-4 text-muted-foreground" />
                      <span className="text-base font-semibold">Wallbox</span>
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-wallbox-power">
                      {formatPower(e3dcData.wallboxPower)}
                    </div>
                  </div>
                ) : null}
              </Card>

              {/* Hausverbrauch */}
              <Card className="p-6">
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : e3dcData ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <HomeIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-base font-semibold">Haus</span>
                    </div>
                    <div className="text-2xl font-bold" data-testid="text-house-power">
                      {formatPower(actualHousePower)}
                    </div>
                  </div>
                ) : null}
              </Card>

              {/* Netz */}
              <Card className="p-6">
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : e3dcData ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Grid3x3 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-base font-semibold">Netz</span>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-2xl font-bold" data-testid="text-grid-power">
                        {formatPower(Math.abs(e3dcData.gridPower))}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="text-grid-direction">
                        {e3dcData.gridPower < 0 ? "Einspeisung" : "Bezug"}
                      </div>
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>

            {/* Effizienzwerte */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Effizienz</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoading ? (
                  <>
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </>
                ) : e3dcData ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Autarkie</span>
                      <span className="text-lg font-semibold" data-testid="text-autarky">{e3dcData.autarky}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Eigenverbrauch</span>
                      <span className="text-lg font-semibold" data-testid="text-self-consumption">{e3dcData.selfConsumption}%</span>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            {/* Letztes Update */}
            {e3dcData?.timestamp && relativeUpdateTime && (
              <div className="text-xs text-left text-muted-foreground" data-testid="text-last-update">
                Letztes Update: {format(new Date(e3dcData.timestamp), 'HH:mm:ss', { locale: de })} ({relativeUpdateTime})
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Batterie-Steuerung Drawer */}
      <Drawer open={showBatteryDrawer} onOpenChange={setShowBatteryDrawer}>
        <DrawerContent>
          <div className="mx-auto w-full max-w-sm">
            <DrawerHeader>
              <DrawerTitle>Batterie-Steuerung</DrawerTitle>
              <DrawerDescription>
                Einstellungen für die Hausbatterie
              </DrawerDescription>
            </DrawerHeader>
            <div className="p-4 space-y-4">
              {/* Batterie-Entladesperre */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <ShieldOff className="w-4 h-4 text-muted-foreground" />
                    <Label htmlFor="battery-lock-drawer" className="text-sm font-medium">
                      Batterie-Entladesperre
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Die Entladung der Hausbatterie ist gesperrt
                  </p>
                </div>
                <Switch
                  id="battery-lock-drawer"
                  checked={controlState?.batteryLock || false}
                  onCheckedChange={(checked) => handleControlChange("batteryLock", checked)}
                  disabled={isLoadingControls || updateControlsMutation.isPending}
                  data-testid="switch-battery-lock"
                />
              </div>

              {/* Netzstrom-Laden */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    <Label htmlFor="grid-charging-drawer" className="text-sm font-medium">
                      Netzstrom-Laden
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Die Hausbatterie wird mit Netzstrom geladen
                  </p>
                </div>
                <Switch
                  id="grid-charging-drawer"
                  checked={controlState?.gridCharging || false}
                  onCheckedChange={(checked) => handleControlChange("gridCharging", checked)}
                  disabled={isLoadingControls || updateControlsMutation.isPending}
                  data-testid="switch-grid-charging"
                />
              </div>

              {/* Netzstrom-Laden während zeitgesteuerter Ladung */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <Label htmlFor="grid-charge-night-drawer" className="text-sm font-medium">
                      Netzstrom bei zeitgesteuerter Ladung
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hausbatterie mit Netzstrom laden während zeitgesteuerter Ladung
                  </p>
                </div>
                <Switch
                  id="grid-charge-night-drawer"
                  checked={settings?.e3dc?.gridChargeDuringNightCharging || false}
                  onCheckedChange={handleGridChargeDuringNightChange}
                  disabled={isLoadingSettings || updateSettingsMutation.isPending}
                  data-testid="switch-e3dc-grid-charge-night"
                />
              </div>
            </div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="outline" data-testid="button-close-drawer">Schließen</Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
