import { useEffect, useState, useRef } from "react";
import { Battery, Plug, Zap, AlertCircle, Gauge, Sun, Moon, ShieldOff, PlugZap, Clock, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import StatusCard from "@/components/StatusCard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WallboxStatus, ControlState, Settings, PlugStatusTracking } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow, format } from "date-fns";
import { de } from "date-fns/locale";

export default function StatusPage() {
  const { toast } = useToast();
  const errorCountRef = useRef(0);
  const [showError, setShowError] = useState(false);
  const [currentAmpere, setCurrentAmpere] = useState(16);
  const previousNightChargingRef = useRef<boolean | undefined>(undefined);
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(false);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [showCableDrawer, setShowCableDrawer] = useState(false);
  const [showEnergyDrawer, setShowEnergyDrawer] = useState(false);

  const { data: status, isLoading, error } = useQuery<WallboxStatus>({
    queryKey: ["/api/wallbox/status"],
    refetchInterval: 5000,
  });

  const { data: controlState } = useQuery<ControlState>({
    queryKey: ["/api/controls"],
    refetchInterval: 5000,
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    refetchInterval: 5000, // Automatisch aktualisieren wie controlState
    refetchOnMount: true, // Immer neu laden wenn Seite gemountet wird
    refetchOnWindowFocus: true, // Neu laden wenn Fenster Fokus bekommt
  });

  const { data: plugTracking } = useQuery<PlugStatusTracking>({
    queryKey: ["/api/wallbox/plug-tracking"],
    refetchInterval: 5000, // Synchron mit Status-Updates
  });

  useEffect(() => {
    if (status) {
      errorCountRef.current = 0;
      setShowError(false);
      if (status.maxCurr > 0) {
        const maxAllowed = status.phases === 3 ? 16 : 32;
        const newCurrent = Math.min(Math.round(status.maxCurr), maxAllowed);
        setCurrentAmpere(newCurrent);
      }
      // Wenn Ladeleistung empfangen wird, "Warte auf Bestätigung" beenden
      if (status.power > 0 && waitingForConfirmation) {
        setWaitingForConfirmation(false);
      }
    } else if (error) {
      errorCountRef.current += 1;
      if (errorCountRef.current >= 3) {
        setShowError(true);
      }
    }
  }, [status, error, waitingForConfirmation]);

  // Wenn Nachtladung aktiviert wird, setze Strom auf Maximum
  useEffect(() => {
    // Nur reagieren, wenn wir bereits einen vorherigen Wert haben (nicht beim ersten Laden)
    if (previousNightChargingRef.current !== undefined) {
      if (controlState && status && controlState.nightCharging && !previousNightChargingRef.current) {
        // Nachtladung wurde gerade aktiviert (Wechsel von false auf true)
        const maxAllowed = status.phases === 3 ? 16 : 32;
        setCurrentAmpere(maxAllowed);
        // Sende Befehl an Wallbox
        setCurrentMutation.mutate(maxAllowed);
      }
    }
    previousNightChargingRef.current = controlState?.nightCharging;
  }, [controlState?.nightCharging, status]);

  const startChargingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/wallbox/start"),
    onSuccess: () => {
      setWaitingForConfirmation(true);
      queryClient.invalidateQueries({ queryKey: ["/api/wallbox/status"] });
      toast({
        title: "Ladevorgang gestartet",
        description: "Die Wallbox wurde erfolgreich aktiviert.",
      });
    },
    onError: () => {
      setWaitingForConfirmation(false);
      toast({
        title: "Fehler",
        description: "Laden konnte nicht gestartet werden.",
        variant: "destructive",
      });
    },
  });

  const stopChargingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/wallbox/stop"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallbox/status"] });
      toast({
        title: "Ladevorgang gestoppt",
        description: "Die Wallbox wurde erfolgreich deaktiviert.",
      });
    },
    onError: () => {
      toast({
        title: "Fehler",
        description: "Laden konnte nicht gestoppt werden.",
        variant: "destructive",
      });
    },
  });

  const setCurrentMutation = useMutation({
    mutationFn: (current: number) => apiRequest("POST", "/api/wallbox/current", { current }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallbox/status"] });
      toast({
        title: "Ladestrom geändert",
        description: `Neuer Ladestrom: ${currentAmpere}A`,
      });
    },
    onError: () => {
      if (status?.maxCurr) {
        setCurrentAmpere(Math.round(status.maxCurr));
      }
      toast({
        title: "Fehler",
        description: "Ladestrom konnte nicht geändert werden.",
        variant: "destructive",
      });
    },
  });

  const handleToggleCharging = () => {
    const isCharging = status?.state === 3;
    if (isCharging) {
      stopChargingMutation.mutate();
    } else {
      startChargingMutation.mutate();
    }
  };

  const handleCurrentChange = (value: number[]) => {
    setCurrentAmpere(value[0]);
  };

  const handleCurrentCommit = () => {
    setCurrentMutation.mutate(currentAmpere);
  };

  const calculatePower = (ampere: number, phases: number) => {
    if (phases === 3) {
      return Math.sqrt(3) * 230 * ampere / 1000;
    } else if (phases === 1) {
      return 230 * ampere / 1000;
    }
    return 0;
  };

  const getPlugStatus = (plug: number) => {
    switch (plug) {
      case 0:
        return "Nicht verbunden";
      case 1:
        return "Verbunden an Wallbox";
      case 3:
        return "Nicht eingesteckt";
      case 5:
        return "Eingesteckt";
      case 7:
        return "Eingesteckt und verriegelt";
      default:
        return "Unbekannt";
    }
  };

  const getStatusBadge = (state: number) => {
    switch (state) {
      case 0:
        return "Startbereit";
      case 1:
        return "Nicht bereit";
      case 2:
        return "Lädt";
      case 3:
        return "Lädt";
      case 4:
        return "Fehler";
      case 5:
        return "Unterbrochen";
      default:
        return "Unbekannt";
    }
  };

  const getPhaseInfo = () => {
    if (!status || !isCharging) return undefined;
    
    const phases = status.phases || 0;
    if (phases === 0) return undefined;

    const activePhases = [
      (status.i1 || 0) >= 1,
      (status.i2 || 0) >= 1,
      (status.i3 || 0) >= 1,
    ].filter(Boolean).length;

    if (phases === 3 && activePhases === 2) {
      return "3-phasig - lädt mit 2 Phasen";
    }
    
    return `${phases}-phasig`;
  };

  const isCharging = status?.state === 2 || status?.state === 3;
  const isPluggedIn = (status?.plug || 0) >= 3;
  const power = status?.power || 0;
  const energySession = (status?.ePres || 0) / 1000;
  const energyTotal = (status?.eTotal || 0) / 1000;
  // Zeige immer aktuelle Energie auf der Kachel
  const energy = energySession;
  const phases = status?.phases || 0;

  const getStatusIcons = () => {
    const icons = [];
    
    if (controlState?.pvSurplus) {
      icons.push({
        icon: Sun,
        label: "PV Überschussladung aktiv",
        color: "text-yellow-500 dark:text-yellow-400"
      });
    }
    if (settings?.nightChargingSchedule?.enabled) {
      icons.push({
        icon: Moon,
        label: "Nachtladungs-Scheduler aktiv",
        color: "text-blue-500 dark:text-blue-400"
      });
    }
    if (settings?.e3dc?.enabled && controlState?.batteryLock) {
      icons.push({
        icon: ShieldOff,
        label: "Batterie-Entladesperre aktiv",
        color: "text-orange-500 dark:text-orange-400"
      });
    }
    if (settings?.e3dc?.enabled && controlState?.gridCharging) {
      icons.push({
        icon: PlugZap,
        label: "Netzstrom-Laden aktiv",
        color: "text-purple-500 dark:text-purple-400"
      });
    }
    return icons;
  };

  const formatTime = (timeString: string) => {
    try {
      const [hours, minutes] = timeString.split(':');
      const date = new Date();
      date.setHours(parseInt(hours), parseInt(minutes));
      return new Intl.DateTimeFormat('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch {
      return timeString;
    }
  };

  const getScheduleTimeRange = () => {
    if (!settings?.nightChargingSchedule) return '';
    const start = formatTime(settings.nightChargingSchedule.startTime);
    const end = formatTime(settings.nightChargingSchedule.endTime);
    return `${start} - ${end}`;
  };

  const getLastChangeFormatted = () => {
    if (!plugTracking?.lastPlugChange) return null;
    
    const lastChange = new Date(plugTracking.lastPlugChange);
    const relativeTime = formatDistanceToNow(lastChange, { 
      addSuffix: true, 
      locale: de 
    });
    
    const absoluteTime = format(lastChange, 'dd.MM.yyyy, HH:mm', { locale: de });
    
    return {
      relative: relativeTime,
      absolute: absoluteTime
    };
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pb-24 pt-6">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">Wallbox Status</h1>
          </div>

          {showError && (
            <Alert variant="destructive" data-testid="alert-error">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Verbindung zur Wallbox fehlgeschlagen. Bitte überprüfen Sie die IP-Adresse in den Einstellungen.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <StatusCard
              icon={Zap}
              title="Ladeleistung"
              value={isLoading ? "..." : power.toFixed(1)}
              unit="kW"
              status={isCharging ? "charging" : "stopped"}
              badge={isLoading ? "..." : waitingForConfirmation ? "Warte auf Bestätigung" : getStatusBadge(status?.state || 0)}
              additionalInfo={getPhaseInfo()}
              statusIcons={getStatusIcons()}
              onClick={() => setShowDetailsDrawer(true)}
            />

            <Card data-testid="card-current-control">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-5 h-5 text-primary" />
                    <CardTitle className="text-base font-semibold">
                      Ladestrom {currentAmpere}A
                    </CardTitle>
                  </div>
                  {controlState?.pvSurplus && (
                    <span className="text-sm text-muted-foreground" data-testid="text-pv-surplus-active">
                      PV-Überschuss aktiv
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Slider
                  value={[currentAmpere]}
                  onValueChange={handleCurrentChange}
                  onValueCommit={handleCurrentCommit}
                  min={6}
                  max={phases === 3 ? 16 : 32}
                  step={1}
                  disabled={setCurrentMutation.isPending || controlState?.pvSurplus === true || !isPluggedIn}
                  data-testid="slider-current"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>6A</span>
                  <span>{phases === 3 ? "16A" : "32A"}</span>
                </div>
              </CardContent>
            </Card>

            <StatusCard
              icon={Battery}
              title="Geladene Energie"
              value={isLoading ? "..." : energy.toFixed(1)}
              unit="kWh"
              status={isCharging ? "charging" : "stopped"}
              onClick={() => setShowEnergyDrawer(true)}
            />

            <StatusCard
              icon={Plug}
              title="Kabelverbindung"
              value={isLoading ? "..." : getPlugStatus(status?.plug || 0)}
              status={isCharging ? "charging" : isPluggedIn ? "ready" : "stopped"}
              compact={true}
              onClick={() => setShowCableDrawer(true)}
            />

            <Button
              onClick={handleToggleCharging}
              size="lg"
              variant={isCharging ? "destructive" : "default"}
              className="w-full h-12 text-base font-medium"
              data-testid="button-toggle-charging"
              disabled={isLoading || startChargingMutation.isPending || stopChargingMutation.isPending}
            >
              {startChargingMutation.isPending || stopChargingMutation.isPending
                ? "Wird verarbeitet..."
                : isCharging
                ? "Laden stoppen"
                : "Laden starten"}
            </Button>
          </div>
        </div>
      </div>

      <Drawer open={showDetailsDrawer} onOpenChange={setShowDetailsDrawer}>
        <DrawerContent data-testid="drawer-charging-details">
          <DrawerHeader>
            <DrawerTitle>SmartHome-Funktionen</DrawerTitle>
            <DrawerDescription>
              Übersicht über aktive Automatisierungen
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-4">
            {/* Nachtladung Scheduler */}
            <div className="space-y-2">
              <div className="flex items-center justify-between" data-testid="section-night-charging">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10 dark:bg-blue-400/10">
                    <Moon className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Automatische Nachtladung</p>
                    {settings?.nightChargingSchedule?.enabled && (
                      <p className="text-sm text-muted-foreground" data-testid="text-night-charging-time">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {getScheduleTimeRange()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center">
                  {settings?.nightChargingSchedule?.enabled ? (
                    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400" data-testid="status-night-charging-enabled">
                      <Check className="w-5 h-5" />
                      <span className="text-sm font-medium">Ein</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-muted-foreground" data-testid="status-night-charging-disabled">
                      <X className="w-5 h-5" />
                      <span className="text-sm font-medium">Aus</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* PV Überschussladung */}
            <div className="space-y-2">
              <div className="flex items-center justify-between" data-testid="section-pv-surplus">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/10 dark:bg-yellow-400/10">
                    <Sun className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />
                  </div>
                  <div>
                    <p className="font-medium">PV-Überschussladung</p>
                    <p className="text-sm text-muted-foreground">
                      Die Wallbox wird nur mit überschüssigem Solarstrom versorgt
                    </p>
                  </div>
                </div>
                <div className="flex items-center">
                  {controlState?.pvSurplus ? (
                    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400" data-testid="status-pv-surplus-enabled">
                      <Check className="w-5 h-5" />
                      <span className="text-sm font-medium">Aktiv</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-muted-foreground" data-testid="status-pv-surplus-disabled">
                      <X className="w-5 h-5" />
                      <span className="text-sm font-medium">Inaktiv</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* E3DC-abhängige Funktionen nur anzeigen wenn E3DC aktiviert */}
            {settings?.e3dc?.enabled && (
              <>
                <Separator />

                {/* Batterie-Entladesperre */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between" data-testid="section-battery-lock">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500/10 dark:bg-orange-400/10">
                        <ShieldOff className="w-5 h-5 text-orange-500 dark:text-orange-400" />
                      </div>
                      <div>
                        <p className="font-medium">Batterie-Entladesperre</p>
                        <p className="text-sm text-muted-foreground">
                          Die Entladung der Hausbatterie ist gesperrt
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      {controlState?.batteryLock ? (
                        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400" data-testid="status-battery-lock-enabled">
                          <Check className="w-5 h-5" />
                          <span className="text-sm font-medium">Aktiv</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-muted-foreground" data-testid="status-battery-lock-disabled">
                          <X className="w-5 h-5" />
                          <span className="text-sm font-medium">Inaktiv</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Netzstrom-Laden */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between" data-testid="section-grid-charging">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-500/10 dark:bg-purple-400/10">
                        <PlugZap className="w-5 h-5 text-purple-500 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="font-medium">Netzstrom-Laden</p>
                        <p className="text-sm text-muted-foreground">
                          Die Hausbatterie wird mit Netzstrom geladen
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      {controlState?.gridCharging ? (
                        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400" data-testid="status-grid-charging-enabled">
                          <Check className="w-5 h-5" />
                          <span className="text-sm font-medium">Aktiv</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-muted-foreground" data-testid="status-grid-charging-disabled">
                          <X className="w-5 h-5" />
                          <span className="text-sm font-medium">Inaktiv</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" data-testid="button-close-drawer">Schließen</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={showCableDrawer} onOpenChange={setShowCableDrawer}>
        <DrawerContent data-testid="drawer-cable-details">
          <DrawerHeader>
            <DrawerTitle>Kabelverbindung</DrawerTitle>
            <DrawerDescription>
              Status der Kabelverbindung an der Wallbox
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-4">
            {/* Aktueller Status */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                  <Plug className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Aktueller Status</p>
                  <p className="text-lg font-semibold" data-testid="text-current-cable-status">
                    {getPlugStatus(status?.plug || 0)}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Letzter Statuswechsel */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 dark:bg-blue-400/10">
                  <Clock className="w-6 h-6 text-blue-500 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Letzter Statuswechsel</p>
                  {getLastChangeFormatted() ? (
                    <div data-testid="section-last-change">
                      <p className="text-lg font-semibold" data-testid="text-last-change-relative">
                        {getLastChangeFormatted()?.relative}
                      </p>
                      <p className="text-sm text-muted-foreground" data-testid="text-last-change-absolute">
                        {getLastChangeFormatted()?.absolute} Uhr
                      </p>
                    </div>
                  ) : (
                    <p className="text-base text-muted-foreground" data-testid="text-no-change-tracked">
                      Kein Wechsel seit App-Start erfasst
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" data-testid="button-close-cable-drawer">Schließen</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={showEnergyDrawer} onOpenChange={setShowEnergyDrawer}>
        <DrawerContent data-testid="drawer-energy-details">
          <DrawerHeader>
            <DrawerTitle>Geladene Energie</DrawerTitle>
            <DrawerDescription>
              Übersicht über die geladene Energie
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-4">
            {/* Aktuelle Ladesitzung */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                  <Battery className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Aktuelle Sitzung</p>
                  <p className="text-lg font-semibold" data-testid="text-energy-session">
                    {energySession.toFixed(1)} kWh
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Gesamtenergie */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 dark:bg-green-400/10">
                  <Zap className="w-6 h-6 text-green-500 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Gesamtenergie</p>
                  <p className="text-lg font-semibold" data-testid="text-energy-total">
                    {energyTotal.toFixed(1)} kWh
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" data-testid="button-close-energy-drawer">Schließen</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
