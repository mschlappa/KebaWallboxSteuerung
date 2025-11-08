import { useEffect, useState, useRef } from "react";
import { Battery, Plug, Zap, AlertCircle, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import StatusCard from "@/components/StatusCard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WallboxStatus, ControlState } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function StatusPage() {
  const { toast } = useToast();
  const errorCountRef = useRef(0);
  const [showError, setShowError] = useState(false);
  const [currentAmpere, setCurrentAmpere] = useState(16);
  const previousNightChargingRef = useRef<boolean | undefined>(undefined);
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(false);
  const [showTotalEnergy, setShowTotalEnergy] = useState(false);

  const { data: status, isLoading, error } = useQuery<WallboxStatus>({
    queryKey: ["/api/wallbox/status"],
    refetchInterval: 5000,
  });

  const { data: controlState } = useQuery<ControlState>({
    queryKey: ["/api/controls"],
    refetchInterval: 5000,
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
        return "Verbunden & Verriegelt";
      case 5:
        return "Verbunden an Fahrzeug";
      case 7:
        return "Verbunden & Verriegelt an Fahrzeug";
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

  const isCharging = status?.state === 2 || status?.state === 3;
  const isPluggedIn = (status?.plug || 0) >= 3;
  const power = status?.power || 0;
  const energySession = (status?.ePres || 0) / 1000;
  const energyTotal = (status?.eTotal || 0) / 1000;
  const energy = showTotalEnergy ? energyTotal : energySession;
  const phases = status?.phases || 0;

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
              additionalInfo={isCharging && phases > 0 ? `${phases}-phasig` : undefined}
            />

            <Card data-testid="card-current-control">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    Ladestrom {currentAmpere}A {phases > 0 && `(${phases}-phasig)`}
                  </CardTitle>
                </div>
                {controlState?.pvSurplus && (
                  <CardDescription>
                    PV-Überschuss aktiv
                  </CardDescription>
                )}
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
                {controlState?.pvSurplus && (
                  <p className="text-xs text-muted-foreground" data-testid="text-pv-surplus-info">
                    Der Ladestrom wird automatisch an den PV-Überschuss angepasst.
                  </p>
                )}
              </CardContent>
            </Card>

            <StatusCard
              icon={Battery}
              title={showTotalEnergy ? "Geladene Energie (Gesamt)" : "Geladene Energie (Aktuell)"}
              value={isLoading ? "..." : energy.toFixed(1)}
              unit="kWh"
              status={isCharging ? "charging" : "stopped"}
              onClick={() => setShowTotalEnergy(!showTotalEnergy)}
            />

            <StatusCard
              icon={Plug}
              title="Kabelverbindung"
              value={isLoading ? "..." : getPlugStatus(status?.plug || 0)}
              status={isCharging ? "charging" : isPluggedIn ? "ready" : "stopped"}
              compact={true}
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
    </div>
  );
}
