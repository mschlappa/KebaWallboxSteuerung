import { useEffect, useState, useRef } from "react";
import { Battery, Plug, Zap, AlertCircle, Gauge, Sun, Moon, ShieldOff, PlugZap, Clock, Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusCard from "@/components/StatusCard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WallboxStatus, ControlState, Settings, PlugStatusTracking, ChargingContext, ChargingStrategy } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

// Strategy Label Mapping
const STRATEGY_OPTIONS: Array<{ value: ChargingStrategy; label: string; description: string }> = [
  { value: "off", label: "Aus", description: "Keine automatische Ladung" },
  { value: "surplus_battery_prio", label: "Überschuss (Batterie priorisiert)", description: "Nur Netzeinspeisung nutzen" },
  { value: "surplus_vehicle_prio", label: "Überschuss (Fahrzeug priorisiert)", description: "Mit Batterie-Entladung" },
  { value: "max_with_battery", label: "Max Power (mit Batterieentladung)", description: "Volle Leistung inkl. Batterie" },
  { value: "max_without_battery", label: "Max Power (ohne Batterieentladung)", description: "Volle Leistung ohne Batterie" },
];

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
  const [showChargingControlDrawer, setShowChargingControlDrawer] = useState(false);
  const [relativeUpdateTime, setRelativeUpdateTime] = useState<string>("");

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

  const { data: chargingContext } = useQuery<ChargingContext>({
    queryKey: ["/api/charging/context"],
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

  // Wenn zeitgesteuerte Ladung aktiviert wird, setze Strom auf Maximum
  useEffect(() => {
    // Nur reagieren, wenn wir bereits einen vorherigen Wert haben (nicht beim ersten Laden)
    if (previousNightChargingRef.current !== undefined) {
      if (controlState && status && controlState.nightCharging && !previousNightChargingRef.current) {
        // Zeitgesteuerte Ladung wurde gerade aktiviert (Wechsel von false auf true)
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

  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: Settings) =>
      apiRequest("POST", "/api/settings", newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/controls"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/controls"] });
    },
  });

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

  const handleNightChargingToggle = (enabled: boolean) => {
    if (!settings) return;
    
    const updatedSettings: Settings = {
      ...settings,
      nightChargingSchedule: {
        enabled,
        startTime: settings.nightChargingSchedule?.startTime || "00:00",
        endTime: settings.nightChargingSchedule?.endTime || "05:00",
      },
    };
    
    updateSettingsMutation.mutate(updatedSettings);
  };

  const handleNightTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    if (!settings) return;
    
    const updatedSettings: Settings = {
      ...settings,
      nightChargingSchedule: {
        enabled: settings.nightChargingSchedule?.enabled || false,
        startTime: field === 'startTime' ? value : (settings.nightChargingSchedule?.startTime || "00:00"),
        endTime: field === 'endTime' ? value : (settings.nightChargingSchedule?.endTime || "05:00"),
      },
    };
    
    updateSettingsMutation.mutate(updatedSettings);
  };

  const handleStrategyChange = (strategy: ChargingStrategy) => {
    if (!settings) return;
    
    const updatedSettings: Settings = {
      ...settings,
      chargingStrategy: {
        minStartPowerWatt: settings.chargingStrategy?.minStartPowerWatt ?? 1400,
        stopThresholdWatt: settings.chargingStrategy?.stopThresholdWatt ?? 1000,
        startDelaySeconds: settings.chargingStrategy?.startDelaySeconds ?? 120,
        stopDelaySeconds: settings.chargingStrategy?.stopDelaySeconds ?? 300,
        physicalPhaseSwitch: settings.chargingStrategy?.physicalPhaseSwitch ?? 3,
        minCurrentChangeAmpere: settings.chargingStrategy?.minCurrentChangeAmpere ?? 1,
        minChangeIntervalSeconds: settings.chargingStrategy?.minChangeIntervalSeconds ?? 60,
        activeStrategy: strategy,
      },
    };
    
    updateSettingsMutation.mutate(updatedSettings);
    
    toast({
      title: "Strategie geändert",
      description: STRATEGY_OPTIONS.find(s => s.value === strategy)?.label || strategy,
    });
  };

  const handlePvSurplusToggle = (enabled: boolean) => {
    if (!controlState) return;
    
    const updatedControls: ControlState = {
      pvSurplus: enabled,
      nightCharging: controlState.nightCharging,
      batteryLock: controlState.batteryLock,
      gridCharging: controlState.gridCharging,
    };
    
    updateControlsMutation.mutate(updatedControls);
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
        return "Bereit";  // State 2 = Ready (Kabel gesteckt, bereit zum Laden)
      case 3:
        return "Lädt";    // State 3 = Charging (aktiv ladend)
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

  const isCharging = status?.state === 3;  // Nur State 3 = Charging, State 2 = Ready
  const isPluggedIn = (status?.plug || 0) >= 3;
  const power = status?.power || 0;
  const energySession = (status?.ePres || 0) / 1000;
  const energyTotal = (status?.eTotal || 0) / 1000;
  // Zeige immer aktuelle Energie auf der Kachel
  const energy = energySession;
  const phases = status?.phases || 0;

  const getStrategyLabel = (strategy: string | undefined) => {
    const option = STRATEGY_OPTIONS.find(opt => opt.value === strategy);
    return option?.label || "Aus";
  };

  const getStatusIcons = () => {
    const icons = [];
    
    // Strategie-Icon (wenn aktiv)
    if (chargingContext?.isActive && chargingContext.strategy !== "off") {
      icons.push({
        icon: Sparkles,
        label: `Strategie: ${getStrategyLabel(chargingContext.strategy)}`,
        color: "text-muted-foreground"
      });
    }
    
    if (settings?.nightChargingSchedule?.enabled) {
      icons.push({
        icon: Clock,
        label: "Zeitgesteuerte Ladung aktiv",
        color: "text-muted-foreground"
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

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    // Schutz gegen Zukunfts-Timestamps (Systemuhr-Differenzen)
    if (diffInSeconds < 0) {
      return 'gerade eben';
    }

    if (diffInSeconds < 60) {
      return `vor ${diffInSeconds} Sekunde${diffInSeconds !== 1 ? 'n' : ''}`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `vor ${minutes} Minute${minutes !== 1 ? 'n' : ''}`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `vor ${hours} Stunde${hours !== 1 ? 'n' : ''}`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `vor ${days} Tag${days !== 1 ? 'en' : ''}`;
    }
  };

  // Update relative time every second
  useEffect(() => {
    if (!status?.lastUpdated) {
      setRelativeUpdateTime("");
      return;
    }

    const updateRelativeTime = () => {
      setRelativeUpdateTime(formatRelativeTime(status.lastUpdated!));
    };

    updateRelativeTime();
    const interval = setInterval(updateRelativeTime, 1000);

    return () => clearInterval(interval);
  }, [status?.lastUpdated]);

  if (isLoading && !status) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Zap className="w-12 h-12 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground">Lade Wallbox-Status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pb-24 pt-6">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/apple-touch-icon.png" alt="EnergyLink" className="w-10 h-10 rounded-lg" />
              <h1 className="text-2xl font-bold mb-0">Wallbox</h1>
            </div>
            {settings?.demoMode && (
              <Badge variant="secondary" className="text-xs shrink-0" data-testid="badge-demo-mode">
                Demo
              </Badge>
            )}
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
              onClick={() => setShowChargingControlDrawer(true)}
              showConfigIcon={true}
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

            {status?.lastUpdated && relativeUpdateTime && (
              <div className="text-xs text-left text-muted-foreground" data-testid="text-last-update">
                Letztes Update: {format(new Date(status.lastUpdated), 'HH:mm:ss', { locale: de })} ({relativeUpdateTime})
              </div>
            )}
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
            {/* Ladestrategie */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/10 dark:bg-yellow-400/10">
                  <Sparkles className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Ladestrategie</p>
                </div>
              </div>
              <div className="pl-[52px]" data-testid="section-charging-strategy">
                <Select
                  value={settings?.chargingStrategy?.activeStrategy || "off"}
                  onValueChange={(value) => handleStrategyChange(value as ChargingStrategy)}
                  disabled={!settings || updateSettingsMutation.isPending}
                >
                  <SelectTrigger className="[&>span]:line-clamp-none" data-testid="select-strategy-desktop">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRATEGY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} data-testid={`option-strategy-${option.value}`}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Zeitgesteuerte Ladung */}
            <div className="space-y-2">
              <div className="flex items-center justify-between" data-testid="section-night-charging">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10 dark:bg-blue-400/10">
                    <Moon className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Zeitgesteuerte Ladung</p>
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
              Status der Kabelverbindung zum Auto
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

      <Drawer open={showChargingControlDrawer} onOpenChange={setShowChargingControlDrawer}>
        <DrawerContent data-testid="drawer-charging-control">
          <div className="mx-auto w-full max-w-sm">
            <DrawerHeader>
              <DrawerTitle>Fahrzeugladung konfigurieren</DrawerTitle>
            </DrawerHeader>
            <div className="p-4 space-y-4">
              {/* Ladestrategie */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Ladestrategie</Label>
                </div>
                <Select
                  value={settings?.chargingStrategy?.activeStrategy || "off"}
                  onValueChange={(value) => handleStrategyChange(value as ChargingStrategy)}
                  disabled={!settings || updateSettingsMutation.isPending}
                >
                  <SelectTrigger className="[&>span]:line-clamp-none" data-testid="select-strategy-drawer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRATEGY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} data-testid={`option-strategy-drawer-${option.value}`}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ladesteuerung Status */}
              {chargingContext?.isActive && (
                <>
                  <Separator />
                  
                  <div className="space-y-3" data-testid="section-charging-strategy">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Aktive Ladestrategie</p>
                        <p className="text-sm font-medium" data-testid="text-strategy-name">
                          {getStrategyLabel(chargingContext.strategy)}
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Ladestrom</p>
                        <p className="text-sm font-medium" data-testid="text-strategy-current">
                          {chargingContext.currentAmpere ?? "–"}A → {chargingContext.targetAmpere ?? "–"}A
                        </p>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Phasen</p>
                        <p className="text-sm font-medium" data-testid="text-strategy-phases">
                          {chargingContext.currentPhases === 3 ? "3-phasig" : chargingContext.currentPhases === 1 ? "1-phasig" : "Unbekannt"}
                        </p>
                      </div>
                      
                      {chargingContext.strategy !== "off" && chargingContext.calculatedSurplus !== undefined && (
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">PV-Überschuss</p>
                          <p className="text-sm font-medium" data-testid="text-strategy-surplus">
                            {chargingContext.calculatedSurplus >= 0 ? "+" : ""}{(chargingContext.calculatedSurplus / 1000).toFixed(2)} kW
                          </p>
                        </div>
                      )}
                      
                      {chargingContext.strategy !== "off" && chargingContext.lastAdjustment && (
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">Letzte Anpassung</p>
                          <p className="text-sm font-medium" data-testid="text-strategy-last-adjustment">
                            {formatRelativeTime(chargingContext.lastAdjustment)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Zeitgesteuerte Ladung */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <Label htmlFor="night-charging-drawer" className="text-sm font-medium">
                      Zeitgesteuerte Ladung
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lädt das Fahrzeug automatisch im hier angegebenen Zeitfenster
                  </p>
                </div>
                <Switch
                  id="night-charging-drawer"
                  checked={settings?.nightChargingSchedule?.enabled || false}
                  onCheckedChange={handleNightChargingToggle}
                  disabled={!settings || updateSettingsMutation.isPending}
                  data-testid="switch-night-charging"
                />
              </div>

              {settings?.nightChargingSchedule?.enabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="night-start-drawer" className="text-xs font-medium">
                      Startzeit
                    </Label>
                    <Input
                      id="night-start-drawer"
                      type="time"
                      value={settings.nightChargingSchedule.startTime}
                      onChange={(e) => handleNightTimeChange('startTime', e.target.value)}
                      className="h-9 text-sm border-none bg-transparent p-0 text-left focus-visible:ring-0 [-webkit-appearance:none] [&::-webkit-calendar-picker-indicator]:dark:invert [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit-text]:p-0 [&::-webkit-datetime-edit-text]:m-0 [&::-webkit-datetime-edit-hour-field]:p-0 [&::-webkit-datetime-edit-hour-field]:m-0 [&::-webkit-datetime-edit-minute-field]:p-0 [&::-webkit-datetime-edit-minute-field]:m-0"
                      data-testid="input-night-start"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="night-end-drawer" className="text-xs font-medium">
                      Endzeit
                    </Label>
                    <Input
                      id="night-end-drawer"
                      type="time"
                      value={settings.nightChargingSchedule.endTime}
                      onChange={(e) => handleNightTimeChange('endTime', e.target.value)}
                      className="h-9 text-sm border-none bg-transparent p-0 text-left focus-visible:ring-0 [-webkit-appearance:none] [&::-webkit-calendar-picker-indicator]:dark:invert [&::-webkit-date-and-time-value]:text-left [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit-text]:p-0 [&::-webkit-datetime-edit-text]:m-0 [&::-webkit-datetime-edit-hour-field]:p-0 [&::-webkit-datetime-edit-hour-field]:m-0 [&::-webkit-datetime-edit-minute-field]:p-0 [&::-webkit-datetime-edit-minute-field]:m-0"
                      data-testid="input-night-end"
                    />
                  </div>
                </div>
              )}
            </div>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="outline" data-testid="button-close-control-drawer">Schließen</Button>
              </DrawerClose>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
